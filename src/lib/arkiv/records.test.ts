import { webcrypto } from "node:crypto";
import { type Entity, type Hash, type Hex, type QueryReturnType } from "@arkiv-network/sdk";
import { describe, expect, it, vi } from "vitest";

import type { ArkivMutationBoundary, ArkivReadClient } from "./client";
import { MEMORY_BODY_ENCRYPTION_SCHEME } from "../crypto/memoryEncryption";
import {
  CONTENT_TYPE_JSON,
  ENTITY_EXPIRES_IN_SECONDS,
  MEMORY_BODY_LIMIT_CHARS,
  PROJECT_ATTRIBUTE,
  buildMemoryRecordQuery,
  resolveArkivConfig,
} from "./contract";
import {
  MemoryRecordEntityError,
  MemoryRecordValidationError,
  createArkivMemoryRecordRepository,
  createMemoryRecordDraftFromInput,
  createMemoryRecordUpdateDraftFromInput,
  decryptMemoryRecordBody,
  isEncryptedMemoryRecordPayload,
  parseMemoryRecordEntity,
  validateMemoryRecordInput,
} from "./records";

const crypto = webcrypto as unknown as Crypto;
const ownerAddress = `0x${"2".repeat(40)}` as Hex;
const profileEntityKey = `0x${"3".repeat(64)}` as Hex;
const recordEntityKey = `0x${"4".repeat(64)}` as Hex;
const txHash = `0x${"5".repeat(64)}` as Hash;
const now = new Date("2026-05-23T00:00:00.000Z");
const updatedNow = new Date("2026-05-24T00:00:00.000Z");
const saltBytes = Uint8Array.from(Array.from({ length: 16 }, (_, index) => index + 1));
const ivBytes = Uint8Array.from(Array.from({ length: 12 }, (_, index) => index + 17));

function createRecordEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    attributes: [
      PROJECT_ATTRIBUTE,
      { key: "entityType", value: "memory_record" },
      { key: "ownerAddress", value: ownerAddress },
      { key: "profileEntityKey", value: profileEntityKey },
      { key: "schemaVersion", value: "1" },
      { key: "tag", value: "preference" },
      { key: "tag", value: "research" },
      { key: "createdAt", value: now.toISOString() },
      { key: "updatedAt", value: now.toISOString() },
    ],
    contentType: CONTENT_TYPE_JSON,
    createdAtBlock: 10n,
    creator: ownerAddress,
    expiresAtBlock: 20n,
    key: recordEntityKey,
    lastModifiedAtBlock: 10n,
    operationIndexInTransaction: undefined,
    owner: ownerAddress,
    payload: undefined,
    toJson: () => ({
      body: "The user prefers concise implementation notes.",
      createdAt: now.toISOString(),
      importance: "medium",
      profileEntityKey,
      schemaVersion: "1",
      source: "manual",
      tags: ["Preference", "research"],
      title: "Style preference",
      updatedAt: now.toISOString(),
    }),
    toText: () => "",
    transactionIndexInBlock: undefined,
    ...overrides,
  };
}

function createEncryptedRecordEntity(overrides: Partial<Entity> = {}): Entity {
  return createRecordEntity({
    toJson: () => ({
      createdAt: now.toISOString(),
      encryptedBody: {
        algorithm: "AES-GCM",
        ciphertext: "c2FmZS1jaXBoZXJ0ZXh0",
        iv: "ERITFBUWFxgZGhsc",
        kdf: {
          hash: "SHA-256",
          iterations: 250000,
          name: "PBKDF2",
          salt: "AQIDBAUGBwgJCgsMDQ4PEA==",
        },
        plaintextFormat: "text/plain",
        scheme: MEMORY_BODY_ENCRYPTION_SCHEME,
      },
      encryption: {
        enabled: true,
        mode: "passphrase",
        plaintextMetadata: ["title", "tags", "source", "importance"],
        scheme: MEMORY_BODY_ENCRYPTION_SCHEME,
      },
      importance: "medium",
      profileEntityKey,
      schemaVersion: "1",
      source: "manual",
      tags: ["preference", "research"],
      title: "Encrypted style preference",
      updatedAt: now.toISOString(),
    }),
    ...overrides,
  });
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
    createEntity: vi.fn(async () => ({ entityKey: recordEntityKey, txHash })),
    deleteEntity: vi.fn(async () => ({ entityKey: recordEntityKey, txHash })),
    updateEntity: vi.fn(async () => ({ entityKey: recordEntityKey, txHash })),
  };
}

describe("memory_record validation", () => {
  it("trims valid input and normalizes tags", () => {
    expect(
      validateMemoryRecordInput({
        body: "  The user prefers concise implementation notes.  ",
        importance: "medium",
        publicTestnetAcknowledged: true,
        source: "  manual  ",
        tags: " Preference, research, preference ",
        title: "  Style preference  ",
      }),
    ).toEqual({
      body: "The user prefers concise implementation notes.",
      encryption: { enabled: false },
      importance: "medium",
      source: "manual",
      tags: ["preference", "research"],
      title: "Style preference",
    });
  });

  it("builds a project-scoped memory_record draft from validated input", async () => {
    const draft = await createMemoryRecordDraftFromInput({
      input: {
        body: "The user prefers concise implementation notes.",
        importance: "medium",
        ownerAddress,
        profileEntityKey,
        publicTestnetAcknowledged: true,
        source: "manual",
        tags: "Preference, Research",
        title: "Style preference",
      },
      now: () => now,
    });

    expect(draft.contentType).toBe(CONTENT_TYPE_JSON);
    expect(draft.payload).toMatchObject({
      body: "The user prefers concise implementation notes.",
      createdAt: now.toISOString(),
      importance: "medium",
      profileEntityKey,
      schemaVersion: "1",
      source: "manual",
      tags: ["preference", "research"],
      title: "Style preference",
      updatedAt: now.toISOString(),
    });
    expect(draft.attributes).toEqual(
      expect.arrayContaining([
        PROJECT_ATTRIBUTE,
        { key: "entityType", value: "memory_record" },
        { key: "ownerAddress", value: ownerAddress },
        { key: "profileEntityKey", value: profileEntityKey },
        { key: "tag", value: "preference" },
        { key: "tag", value: "research" },
      ]),
    );
  });

  it("builds a full update draft that preserves createdAt, profile relationship, and indexed tags", async () => {
    const record = parseMemoryRecordEntity(createRecordEntity());
    const draft = await createMemoryRecordUpdateDraftFromInput({
      input: {
        body: "The user now prefers detailed release notes.",
        importance: "high",
        ownerAddress,
        publicTestnetAcknowledged: true,
        record,
        source: "manual update",
        tags: "Release Notes, preference, release notes",
        title: "Updated style preference",
      },
      now: () => updatedNow,
    });

    expect(draft.contentType).toBe(CONTENT_TYPE_JSON);
    expect(draft.expiresIn).toBe(ENTITY_EXPIRES_IN_SECONDS);
    expect(draft.payload).toEqual({
      body: "The user now prefers detailed release notes.",
      createdAt: now.toISOString(),
      importance: "high",
      profileEntityKey,
      schemaVersion: "1",
      source: "manual update",
      tags: ["preference", "release-notes"],
      title: "Updated style preference",
      updatedAt: updatedNow.toISOString(),
    });
    expect(draft.payload.updatedAt).not.toBe(record.payload.updatedAt);
    expect(draft.attributes).toEqual(
      expect.arrayContaining([
        PROJECT_ATTRIBUTE,
        { key: "entityType", value: "memory_record" },
        { key: "ownerAddress", value: ownerAddress },
        { key: "profileEntityKey", value: profileEntityKey },
        { key: "schemaVersion", value: "1" },
        { key: "tag", value: "preference" },
        { key: "tag", value: "release-notes" },
        { key: "createdAt", value: now.toISOString() },
        { key: "updatedAt", value: updatedNow.toISOString() },
      ]),
    );
  });

  it("rejects a missing profile", async () => {
    await expect(
      createMemoryRecordDraftFromInput({
        input: {
          body: "The user prefers concise implementation notes.",
          importance: "medium",
          ownerAddress,
          profileEntityKey: "",
          publicTestnetAcknowledged: true,
          tags: "preference",
          title: "Style preference",
        },
      }),
    ).rejects.toThrow(MemoryRecordValidationError);
  });

  it("rejects missing title and body", () => {
    try {
      validateMemoryRecordInput({
        body: "",
        importance: "medium",
        publicTestnetAcknowledged: true,
        tags: "",
        title: "",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MemoryRecordValidationError);
      expect((error as MemoryRecordValidationError).fieldErrors).toMatchObject({
        body: "Body is required.",
        title: "Title is required.",
      });
    }
  });

  it("rejects update input with missing required title and body", async () => {
    const record = parseMemoryRecordEntity(createRecordEntity());

    await expect(
      createMemoryRecordUpdateDraftFromInput({
        input: {
          body: "",
          importance: "medium",
          ownerAddress,
          publicTestnetAcknowledged: true,
          record,
          tags: "",
          title: "",
        },
      }),
    ).rejects.toThrow(MemoryRecordValidationError);
  });

  it("enforces the body length boundary", () => {
    expect(() =>
      validateMemoryRecordInput({
        body: "x".repeat(MEMORY_BODY_LIMIT_CHARS),
        importance: "medium",
        publicTestnetAcknowledged: true,
        tags: "",
        title: "Boundary body",
      }),
    ).not.toThrow();

    expect(() =>
      validateMemoryRecordInput({
        body: "x".repeat(MEMORY_BODY_LIMIT_CHARS + 1),
        importance: "medium",
        publicTestnetAcknowledged: true,
        tags: "",
        title: "Too large",
      }),
    ).toThrow(MemoryRecordValidationError);
  });

  it("requires public testnet acknowledgement for plaintext bodies", () => {
    expect(() =>
      validateMemoryRecordInput({
        body: "The user prefers concise implementation notes.",
        importance: "medium",
        publicTestnetAcknowledged: false,
        tags: "preference",
        title: "Style preference",
      }),
    ).toThrow(MemoryRecordValidationError);
  });

  it("requires a passphrase when encryption is enabled", () => {
    expect(() =>
      validateMemoryRecordInput({
        body: "The user prefers concise implementation notes.",
        encryptionEnabled: true,
        encryptionPassphrase: "",
        importance: "medium",
        publicTestnetAcknowledged: false,
        tags: "preference",
        title: "Style preference",
      }),
    ).toThrow(MemoryRecordValidationError);
  });

  it("builds an encrypted draft without plaintext body in payload or attributes", async () => {
    const draft = await createMemoryRecordDraftFromInput({
      crypto: {
        crypto,
        iterations: 1_000,
        ivBytes,
        saltBytes,
      },
      input: {
        body: "The user prefers concise implementation notes.",
        encryptionEnabled: true,
        encryptionPassphrase: "memory passphrase",
        importance: "medium",
        ownerAddress,
        profileEntityKey,
        publicTestnetAcknowledged: false,
        source: "manual",
        tags: "Preference, Research",
        title: "Style preference",
      },
      now: () => now,
    });

    expect(draft.contentType).toBe(CONTENT_TYPE_JSON);
    expect(draft.expiresIn).toBe(ENTITY_EXPIRES_IN_SECONDS);
    expect(draft.payload).toMatchObject({
      createdAt: now.toISOString(),
      encryption: {
        enabled: true,
        mode: "passphrase",
        scheme: MEMORY_BODY_ENCRYPTION_SCHEME,
      },
      importance: "medium",
      profileEntityKey,
      schemaVersion: "1",
      source: "manual",
      tags: ["preference", "research"],
      title: "Style preference",
      updatedAt: now.toISOString(),
    });
    expect(isEncryptedMemoryRecordPayload(draft.payload)).toBe(true);
    expect(JSON.stringify(draft.payload)).not.toContain("The user prefers concise implementation notes.");
    expect(JSON.stringify(draft.attributes)).not.toContain("The user prefers concise implementation notes.");
    expect(draft.attributes).toEqual(
      expect.arrayContaining([
        PROJECT_ATTRIBUTE,
        { key: "entityType", value: "memory_record" },
        { key: "ownerAddress", value: ownerAddress },
        { key: "profileEntityKey", value: profileEntityKey },
        { key: "schemaVersion", value: "1" },
        { key: "tag", value: "preference" },
        { key: "tag", value: "research" },
        { key: "createdAt", value: now.toISOString() },
        { key: "updatedAt", value: now.toISOString() },
      ]),
    );
  });
});

describe("memory_record repository", () => {
  it("creates record drafts through the project-scoped mutation boundary", async () => {
    const mutations = createMutations();
    const repository = createArkivMemoryRecordRepository({
      mutations,
      now: () => now,
      readClient: createReadClient([createRecordEntity()]),
    });

    await expect(
      repository.createRecord({
        body: "The user prefers concise implementation notes.",
        importance: "medium",
        ownerAddress,
        profileEntityKey,
        publicTestnetAcknowledged: true,
        source: "manual",
        tags: "Preference, Research",
        title: "Style preference",
      }),
    ).resolves.toMatchObject({ entityKey: recordEntityKey, txHash });

    expect(mutations.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.arrayContaining([
          PROJECT_ATTRIBUTE,
          { key: "entityType", value: "memory_record" },
          { key: "ownerAddress", value: ownerAddress },
          { key: "profileEntityKey", value: profileEntityKey },
          { key: "tag", value: "preference" },
          { key: "tag", value: "research" },
        ]),
      }),
    );
  });

  it("creates encrypted record drafts while preserving owner, project, and profile attributes", async () => {
    const mutations = createMutations();
    const repository = createArkivMemoryRecordRepository({
      crypto: {
        crypto,
        iterations: 1_000,
        ivBytes,
        saltBytes,
      },
      mutations,
      now: () => now,
      readClient: createReadClient([createEncryptedRecordEntity()]),
    });

    const result = await repository.createRecord({
      body: "The user prefers concise implementation notes.",
      encryptionEnabled: true,
      encryptionPassphrase: "memory passphrase",
      importance: "medium",
      ownerAddress,
      profileEntityKey,
      publicTestnetAcknowledged: false,
      source: "manual",
      tags: "Preference, Research",
      title: "Style preference",
    });

    expect(result.draft.attributes).toEqual(
      expect.arrayContaining([
        PROJECT_ATTRIBUTE,
        { key: "entityType", value: "memory_record" },
        { key: "ownerAddress", value: ownerAddress },
        { key: "profileEntityKey", value: profileEntityKey },
        { key: "schemaVersion", value: "1" },
        { key: "tag", value: "preference" },
        { key: "tag", value: "research" },
      ]),
    );
    expect(result.draft.contentType).toBe(CONTENT_TYPE_JSON);
    expect(result.draft.expiresIn).toBe(ENTITY_EXPIRES_IN_SECONDS);
    expect(JSON.stringify(result.draft)).not.toContain("The user prefers concise implementation notes.");
    expect(mutations.createEntity).toHaveBeenCalledWith(result.draft);
  });

  it("queries owner, profile, and tag-scoped records with the project attribute", async () => {
    const readClient = createReadClient([createRecordEntity()]);
    const repository = createArkivMemoryRecordRepository({
      mutations: createMutations(),
      readClient,
    });

    const records = await repository.listRecords({
      ownerAddress,
      profileEntityKey,
      tag: "Research",
    });

    expect(records[0].payload.title).toBe("Style preference");
    expect(readClient.queryEntities).toHaveBeenCalledWith({
      options: {
        includeData: {
          attributes: true,
          metadata: true,
          payload: true,
        },
        orderBy: [{ desc: "desc", name: "createdAt", type: "string" }],
      },
      query: buildMemoryRecordQuery({ ownerAddress, profileEntityKey, tag: "Research" }),
    });
  });

  it("updates record drafts through the project-scoped mutation boundary", async () => {
    const mutations = createMutations();
    const repository = createArkivMemoryRecordRepository({
      mutations,
      now: () => updatedNow,
      readClient: createReadClient([createRecordEntity()]),
    });
    const record = parseMemoryRecordEntity(createRecordEntity());

    await expect(
      repository.updateRecord({
        body: "The user now prefers detailed release notes.",
        importance: "high",
        ownerAddress,
        publicTestnetAcknowledged: true,
        record,
        source: "manual update",
        tags: "Release Notes, preference",
        title: "Updated style preference",
      }),
    ).resolves.toMatchObject({ entityKey: recordEntityKey, txHash });

    expect(mutations.updateEntity).toHaveBeenCalledWith({
      entityKey: recordEntityKey,
      draft: expect.objectContaining({
        attributes: expect.arrayContaining([
          PROJECT_ATTRIBUTE,
          { key: "entityType", value: "memory_record" },
          { key: "ownerAddress", value: ownerAddress },
          { key: "profileEntityKey", value: profileEntityKey },
          { key: "tag", value: "preference" },
          { key: "tag", value: "release-notes" },
          { key: "createdAt", value: now.toISOString() },
          { key: "updatedAt", value: updatedNow.toISOString() },
        ]),
      }),
    });
  });

  it("delegates delete with the selected record entity key", async () => {
    const mutations = createMutations();
    const repository = createArkivMemoryRecordRepository({
      mutations,
      readClient: createReadClient([createRecordEntity()]),
    });
    const record = parseMemoryRecordEntity(createRecordEntity());

    await expect(repository.deleteRecord({ ownerAddress, record })).resolves.toEqual({
      entityKey: recordEntityKey,
      txHash,
    });

    expect(mutations.deleteEntity).toHaveBeenCalledWith({ entityKey: recordEntityKey });
  });

  it("rejects update and delete for a non-owner before mutation delegation", async () => {
    const mutations = createMutations();
    const repository = createArkivMemoryRecordRepository({
      mutations,
      readClient: createReadClient([createRecordEntity()]),
    });
    const record = parseMemoryRecordEntity(createRecordEntity({ owner: `0x${"9".repeat(40)}` as Hex }));

    await expect(
      repository.updateRecord({
        body: "The user now prefers detailed release notes.",
        importance: "high",
        ownerAddress,
        publicTestnetAcknowledged: true,
        record,
        tags: "release notes",
        title: "Updated style preference",
      }),
    ).rejects.toThrow("Authorization failed");
    await expect(repository.deleteRecord({ ownerAddress, record })).rejects.toThrow("Authorization failed");

    expect(mutations.updateEntity).not.toHaveBeenCalled();
    expect(mutations.deleteEntity).not.toHaveBeenCalled();
  });

  it("reads a memory_record entity by key", async () => {
    const readClient = createReadClient([createRecordEntity()]);
    const repository = createArkivMemoryRecordRepository({
      mutations: createMutations(),
      readClient,
    });

    const record = await repository.readRecord({ entityKey: recordEntityKey });

    expect(record.entityKey).toBe(recordEntityKey);
    expect(record.payload.tags).toEqual(["preference", "research"]);
    expect(readClient.readEntity).toHaveBeenCalledWith({ entityKey: recordEntityKey });
  });

  it("parses encrypted records as locked payloads and preserves searchable metadata", () => {
    const record = parseMemoryRecordEntity(createEncryptedRecordEntity());

    expect(record.payload.title).toBe("Encrypted style preference");
    expect(record.payload.profileEntityKey).toBe(profileEntityKey);
    expect(record.ownerAddress).toBe(ownerAddress);
    expect(record.attributes).toEqual(
      expect.arrayContaining([
        PROJECT_ATTRIBUTE,
        { key: "ownerAddress", value: ownerAddress },
        { key: "profileEntityKey", value: profileEntityKey },
      ]),
    );
    expect(isEncryptedMemoryRecordPayload(record.payload)).toBe(true);
    expect(JSON.stringify(record.payload)).not.toContain("The user prefers concise implementation notes.");
  });

  it("decrypts encrypted record bodies only with the supplied passphrase", async () => {
    const draft = await createMemoryRecordDraftFromInput({
      crypto: {
        crypto,
        iterations: 1_000,
        ivBytes,
        saltBytes,
      },
      input: {
        body: "The user prefers concise implementation notes.",
        encryptionEnabled: true,
        encryptionPassphrase: "memory passphrase",
        importance: "medium",
        ownerAddress,
        profileEntityKey,
        publicTestnetAcknowledged: false,
        tags: "preference",
        title: "Style preference",
      },
      now: () => now,
    });
    const encryptedRecord = {
      ...parseMemoryRecordEntity(createEncryptedRecordEntity()),
      payload: draft.payload,
    };

    await expect(decryptMemoryRecordBody(encryptedRecord, "memory passphrase", { crypto })).resolves.toBe(
      "The user prefers concise implementation notes.",
    );
    await expect(decryptMemoryRecordBody(encryptedRecord, "wrong passphrase", { crypto })).rejects.toThrow(
      "Passphrase could not decrypt",
    );
  });

  it("rejects entities that are not memory_record", () => {
    expect(() =>
      parseMemoryRecordEntity(
        createRecordEntity({
          attributes: [PROJECT_ATTRIBUTE, { key: "entityType", value: "memory_profile" }],
        }),
      ),
    ).toThrow(MemoryRecordEntityError);
  });

  it("rejects records missing the indexed profile relationship", () => {
    expect(() =>
      parseMemoryRecordEntity(
        createRecordEntity({
          attributes: [
            PROJECT_ATTRIBUTE,
            { key: "entityType", value: "memory_record" },
            { key: "ownerAddress", value: ownerAddress },
          ],
        }),
      ),
    ).toThrow(MemoryRecordEntityError);
  });
});
