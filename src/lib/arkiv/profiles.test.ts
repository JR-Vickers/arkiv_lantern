import { type Entity, type Hash, type Hex, type QueryReturnType } from "@arkiv-network/sdk";
import { describe, expect, it, vi } from "vitest";

import type { ArkivMutationBoundary, ArkivReadClient } from "./client";
import {
  CONTENT_TYPE_JSON,
  ENTITY_EXPIRES_IN_SECONDS,
  PROJECT_ATTRIBUTE,
  PROJECT_ATTRIBUTE_KEY,
  buildProfileQuery,
  resolveArkivConfig,
} from "./contract";
import {
  MemoryProfileEntityError,
  MemoryProfileValidationError,
  createArkivMemoryProfileRepository,
  createMemoryProfileDraftFromInput,
  createMemoryProfileUpdateDraftFromInput,
  parseMemoryProfileEntity,
  validateMemoryProfileInput,
} from "./profiles";

const ownerAddress = `0x${"2".repeat(40)}` as Hex;
const entityKey = `0x${"3".repeat(64)}` as Hex;
const txHash = `0x${"4".repeat(64)}` as Hash;
const now = new Date("2026-05-23T00:00:00.000Z");
const updatedNow = new Date("2026-05-24T00:00:00.000Z");

function createProfileEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    attributes: [
      PROJECT_ATTRIBUTE,
      { key: "entityType", value: "memory_profile" },
      { key: "ownerAddress", value: ownerAddress },
      { key: "schemaVersion", value: "1" },
      { key: "createdAt", value: now.toISOString() },
      { key: "updatedAt", value: now.toISOString() },
    ],
    contentType: CONTENT_TYPE_JSON,
    createdAtBlock: 10n,
    creator: ownerAddress,
    expiresAtBlock: 20n,
    key: entityKey,
    lastModifiedAtBlock: 10n,
    operationIndexInTransaction: undefined,
    owner: ownerAddress,
    payload: undefined,
    toJson: () => ({
      agentPurpose: "Remember user-owned research context",
      createdAt: now.toISOString(),
      displayName: "Research Agent",
      notes: "Demo notes",
      schemaVersion: "1",
      updatedAt: now.toISOString(),
    }),
    toText: () => "",
    transactionIndexInBlock: undefined,
    ...overrides,
  };
}

function createReadClient(entities: Entity[]): ArkivReadClient {
  const result: QueryReturnType = {
    blockNumber: 1n,
    cursor: undefined,
    entities,
  };

  return {
    config: resolveArkivConfig(),
    queryEntities: vi.fn(async () => result),
    readEntity: vi.fn(async () => entities[0]),
  };
}

function createMutations(): ArkivMutationBoundary {
  return {
    createEntity: vi.fn(async () => ({ entityKey, txHash })),
    deleteEntity: vi.fn(async () => ({ entityKey, txHash })),
    updateEntity: vi.fn(async () => ({ entityKey, txHash })),
  };
}

describe("memory_profile validation", () => {
  it("trims valid profile input", () => {
    expect(
      validateMemoryProfileInput({
        agentPurpose: "  Remember research context  ",
        displayName: "  Research Agent  ",
        notes: "  Demo notes  ",
      }),
    ).toEqual({
      agentPurpose: "Remember research context",
      displayName: "Research Agent",
      notes: "Demo notes",
    });
  });

  it("rejects missing required profile fields", () => {
    expect(() => validateMemoryProfileInput({ agentPurpose: "", displayName: "" })).toThrow(
      MemoryProfileValidationError,
    );

    try {
      validateMemoryProfileInput({ agentPurpose: "", displayName: "" });
    } catch (error) {
      expect(error).toBeInstanceOf(MemoryProfileValidationError);
      expect((error as MemoryProfileValidationError).fieldErrors).toEqual({
        agentPurpose: "Agent purpose is required.",
        displayName: "Display name is required.",
      });
    }
  });

  it("builds a project-scoped profile draft from validated input", () => {
    const draft = createMemoryProfileDraftFromInput({
      input: {
        agentPurpose: "Remember user-owned research context",
        displayName: "Research Agent",
        ownerAddress,
      },
      now: () => now,
    });

    expect(draft.payload).toMatchObject({
      agentPurpose: "Remember user-owned research context",
      createdAt: now.toISOString(),
      displayName: "Research Agent",
      schemaVersion: "1",
      updatedAt: now.toISOString(),
    });
    expect(draft.attributes).toContainEqual(PROJECT_ATTRIBUTE);
    expect(draft.attributes).toContainEqual({ key: "entityType", value: "memory_profile" });
    expect(draft.attributes).toContainEqual({ key: "ownerAddress", value: ownerAddress });
  });

  it("builds a full project-scoped update draft that preserves createdAt and owner scope", () => {
    const profile = parseMemoryProfileEntity(createProfileEntity());
    const draft = createMemoryProfileUpdateDraftFromInput({
      input: {
        agentPurpose: "Remember updated research context",
        displayName: "Research Agent Updated",
        notes: "Updated notes",
        ownerAddress,
        profile,
      },
      now: () => updatedNow,
    });

    expect(draft.contentType).toBe(CONTENT_TYPE_JSON);
    expect(draft.expiresIn).toBe(ENTITY_EXPIRES_IN_SECONDS);
    expect(draft.payload).toEqual({
      agentPurpose: "Remember updated research context",
      createdAt: now.toISOString(),
      displayName: "Research Agent Updated",
      notes: "Updated notes",
      schemaVersion: "1",
      updatedAt: updatedNow.toISOString(),
    });
    expect(draft.payload.updatedAt).not.toBe(profile.payload.updatedAt);
    expect(draft.attributes).toEqual(
      expect.arrayContaining([
        PROJECT_ATTRIBUTE,
        { key: "entityType", value: "memory_profile" },
        { key: "ownerAddress", value: ownerAddress },
        { key: "schemaVersion", value: "1" },
        { key: "createdAt", value: now.toISOString() },
        { key: "updatedAt", value: updatedNow.toISOString() },
      ]),
    );
  });
});

describe("memory_profile repository", () => {
  it("creates profile drafts through the project-scoped mutation boundary", async () => {
    const mutations = createMutations();
    const repository = createArkivMemoryProfileRepository({
      mutations,
      now: () => now,
      readClient: createReadClient([createProfileEntity()]),
    });

    await expect(
      repository.createProfile({
        agentPurpose: "Remember user-owned research context",
        displayName: "Research Agent",
        ownerAddress,
      }),
    ).resolves.toMatchObject({ entityKey, txHash });

    expect(mutations.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.arrayContaining([PROJECT_ATTRIBUTE, { key: "entityType", value: "memory_profile" }]),
      }),
    );
  });

  it("queries owner-scoped profiles with the project attribute", async () => {
    const readClient = createReadClient([createProfileEntity()]);
    const repository = createArkivMemoryProfileRepository({
      mutations: createMutations(),
      readClient,
    });

    const profiles = await repository.listProfiles({ ownerAddress });

    expect(profiles[0].payload.displayName).toBe("Research Agent");
    expect(readClient.queryEntities).toHaveBeenCalledWith({
      options: {
        includeData: {
          attributes: true,
          metadata: true,
          payload: true,
        },
        orderBy: [{ desc: "desc", name: "createdAt", type: "string" }],
      },
      query: buildProfileQuery({ ownerAddress }),
    });
  });

  it("updates profile drafts through the project-scoped mutation boundary", async () => {
    const mutations = createMutations();
    const repository = createArkivMemoryProfileRepository({
      mutations,
      now: () => updatedNow,
      readClient: createReadClient([createProfileEntity()]),
    });
    const profile = parseMemoryProfileEntity(createProfileEntity());

    await expect(
      repository.updateProfile({
        agentPurpose: "Remember updated research context",
        displayName: "Research Agent Updated",
        notes: "Updated notes",
        ownerAddress,
        profile,
      }),
    ).resolves.toMatchObject({ entityKey, txHash });

    expect(mutations.updateEntity).toHaveBeenCalledWith({
      entityKey,
      draft: expect.objectContaining({
        attributes: expect.arrayContaining([
          PROJECT_ATTRIBUTE,
          { key: "entityType", value: "memory_profile" },
          { key: "ownerAddress", value: ownerAddress },
          { key: "createdAt", value: now.toISOString() },
          { key: "updatedAt", value: updatedNow.toISOString() },
        ]),
      }),
    });
  });

  it("delegates delete with the selected profile entity key", async () => {
    const mutations = createMutations();
    const repository = createArkivMemoryProfileRepository({
      mutations,
      readClient: createReadClient([createProfileEntity()]),
    });
    const profile = parseMemoryProfileEntity(createProfileEntity());

    await expect(repository.deleteProfile({ ownerAddress, profile })).resolves.toEqual({ entityKey, txHash });

    expect(mutations.deleteEntity).toHaveBeenCalledWith({ entityKey });
  });

  it("rejects update and delete for a non-owner before mutation delegation", async () => {
    const mutations = createMutations();
    const repository = createArkivMemoryProfileRepository({
      mutations,
      readClient: createReadClient([createProfileEntity()]),
    });
    const profile = parseMemoryProfileEntity(createProfileEntity({ owner: `0x${"9".repeat(40)}` as Hex }));

    await expect(
      repository.updateProfile({
        agentPurpose: "Remember updated research context",
        displayName: "Research Agent Updated",
        ownerAddress,
        profile,
      }),
    ).rejects.toThrow("Authorization failed");
    await expect(repository.deleteProfile({ ownerAddress, profile })).rejects.toThrow("Authorization failed");

    expect(mutations.updateEntity).not.toHaveBeenCalled();
    expect(mutations.deleteEntity).not.toHaveBeenCalled();
  });

  it("reads a profile entity by key", async () => {
    const readClient = createReadClient([createProfileEntity()]);
    const repository = createArkivMemoryProfileRepository({
      mutations: createMutations(),
      readClient,
    });

    const profile = await repository.readProfile({ entityKey });

    expect(profile.entityKey).toBe(entityKey);
    expect(readClient.readEntity).toHaveBeenCalledWith({ entityKey });
  });

  it("rejects entities without the required project attribute", () => {
    expect(() =>
      parseMemoryProfileEntity(
        createProfileEntity({
          attributes: [{ key: PROJECT_ATTRIBUTE_KEY, value: "another-project" }],
        }),
      ),
    ).toThrow();
  });

  it("rejects entities that are not memory_profile", () => {
    expect(() =>
      parseMemoryProfileEntity(
        createProfileEntity({
          attributes: [PROJECT_ATTRIBUTE, { key: "entityType", value: "memory_record" }],
        }),
      ),
    ).toThrow(MemoryProfileEntityError);
  });
});
