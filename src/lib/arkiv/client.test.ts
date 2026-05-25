import { type Entity, type Hash, type Hex, type QueryReturnType } from "@arkiv-network/sdk";
import { describe, expect, it, vi } from "vitest";

import {
  type ArkivMutationSigner,
  type ArkivPublicTransport,
  createArkivReadClient,
  createProjectScopedMutationBoundary,
} from "./client";
import {
  ArkivProjectAttributeError,
  CONTENT_TYPE_JSON,
  PROJECT_ATTRIBUTE,
  PROJECT_ATTRIBUTE_KEY,
  buildProfileQuery,
  createMemoryProfileEntityDraft,
} from "./contract";

const entityKey = `0x${"1".repeat(64)}` as Hex;
const ownerAddress = `0x${"2".repeat(40)}` as Hex;
const txHash = `0x${"3".repeat(64)}` as Hash;
const now = "2026-05-23T00:00:00.000Z";

function createEntity(
  attributes: ReadonlyArray<{ key: string; value: number | string }> = [PROJECT_ATTRIBUTE],
): Entity {
  return {
    attributes: [...attributes],
    contentType: CONTENT_TYPE_JSON,
    createdAtBlock: undefined,
    creator: ownerAddress,
    expiresAtBlock: undefined,
    key: entityKey,
    lastModifiedAtBlock: undefined,
    operationIndexInTransaction: undefined,
    owner: ownerAddress,
    payload: undefined,
    toJson: () => ({}),
    toText: () => "",
    transactionIndexInBlock: undefined,
  };
}

function createTransport(entity = createEntity()): ArkivPublicTransport {
  const result: QueryReturnType = {
    blockNumber: 1n,
    cursor: undefined,
    entities: [entity],
  };

  return {
    getEntity: vi.fn(async () => entity),
    query: vi.fn(async () => result),
  };
}

function createProfileDraft() {
  return createMemoryProfileEntityDraft(
    {
      displayName: "Demo Agent",
      agentPurpose: "Remember user-owned preferences",
      createdAt: now,
      updatedAt: now,
    },
    ownerAddress,
  );
}

describe("Arkiv read/query client boundary", () => {
  it("uses Braga config by default", () => {
    const client = createArkivReadClient({ transport: createTransport() });

    expect(client.config.networkName).toBe("braga");
    expect(client.config.rpcUrl).toBe("https://braga.hoodi.arkiv.network/rpc");
  });

  it("rejects unscoped queries before touching the transport", async () => {
    const transport = createTransport();
    const client = createArkivReadClient({ transport });

    await expect(client.queryEntities({ query: 'entityType = "memory_profile"' })).rejects.toThrow(
      ArkivProjectAttributeError,
    );
    expect(transport.query).not.toHaveBeenCalled();
  });

  it("forces attributes into query responses so returned entities can be verified", async () => {
    const transport = createTransport();
    const client = createArkivReadClient({ transport });
    const query = buildProfileQuery({ ownerAddress });

    await client.queryEntities({
      options: {
        includeData: {
          attributes: false,
          metadata: true,
          payload: false,
        },
      },
      query,
    });

    expect(transport.query).toHaveBeenCalledWith(query, {
      includeData: {
        attributes: true,
        metadata: true,
        payload: false,
      },
    });
  });

  it("rejects query results that are not project-scoped", async () => {
    const transport = createTransport(createEntity([{ key: PROJECT_ATTRIBUTE_KEY, value: "another-project" }]));
    const client = createArkivReadClient({ transport });

    await expect(client.queryEntities({ query: buildProfileQuery({ ownerAddress }) })).rejects.toThrow(
      ArkivProjectAttributeError,
    );
  });

  it("rejects read results that are not project-scoped", async () => {
    const transport = createTransport(createEntity([{ key: "entityType", value: "memory_profile" }]));
    const client = createArkivReadClient({ transport });

    await expect(client.readEntity({ entityKey })).rejects.toThrow(ArkivProjectAttributeError);
  });
});

describe("Arkiv mutation signer boundary", () => {
  it("validates create and update drafts before delegating to the signer", async () => {
    const signer: ArkivMutationSigner = {
      createEntity: vi.fn(async () => ({ entityKey, txHash })),
      deleteEntity: vi.fn(async () => ({ entityKey, txHash })),
      updateEntity: vi.fn(async () => ({ entityKey, txHash })),
    };
    const boundary = createProjectScopedMutationBoundary(signer);
    const draft = createProfileDraft();

    await expect(boundary.createEntity(draft)).resolves.toEqual({ entityKey, txHash });
    await expect(boundary.updateEntity({ entityKey, draft })).resolves.toEqual({ entityKey, txHash });

    expect(signer.createEntity).toHaveBeenCalledWith(draft);
    expect(signer.updateEntity).toHaveBeenCalledWith({ entityKey, draft });
  });

  it("rejects mutation drafts with missing or invalid project attributes without signing", async () => {
    const signer: ArkivMutationSigner = {
      createEntity: vi.fn(async () => ({ entityKey, txHash })),
      deleteEntity: vi.fn(async () => ({ entityKey, txHash })),
      updateEntity: vi.fn(async () => ({ entityKey, txHash })),
    };
    const boundary = createProjectScopedMutationBoundary(signer);
    const draft = {
      ...createProfileDraft(),
      attributes: [{ key: PROJECT_ATTRIBUTE_KEY, value: "another-project" }],
    };

    await expect(boundary.createEntity(draft)).rejects.toThrow(ArkivProjectAttributeError);
    await expect(boundary.updateEntity({ entityKey, draft })).rejects.toThrow(ArkivProjectAttributeError);

    expect(signer.createEntity).not.toHaveBeenCalled();
    expect(signer.updateEntity).not.toHaveBeenCalled();
  });

  it("leaves delete signing behind the injected signer", async () => {
    const signer: ArkivMutationSigner = {
      createEntity: vi.fn(async () => ({ entityKey, txHash })),
      deleteEntity: vi.fn(async () => ({ entityKey, txHash })),
      updateEntity: vi.fn(async () => ({ entityKey, txHash })),
    };
    const boundary = createProjectScopedMutationBoundary(signer);

    await expect(boundary.deleteEntity({ entityKey })).resolves.toEqual({ entityKey, txHash });
    expect(signer.deleteEntity).toHaveBeenCalledWith({ entityKey });
  });

  it("keeps change-ownership signing optional and injected", async () => {
    const signer: ArkivMutationSigner = {
      changeOwnership: vi.fn(async () => ({ entityKey, txHash })),
      createEntity: vi.fn(async () => ({ entityKey, txHash })),
      deleteEntity: vi.fn(async () => ({ entityKey, txHash })),
      updateEntity: vi.fn(async () => ({ entityKey, txHash })),
    };
    const boundary = createProjectScopedMutationBoundary(signer);

    await expect(boundary.changeOwnership?.({ entityKey, nextOwnerAddress: ownerAddress })).resolves.toEqual({
      entityKey,
      txHash,
    });
    expect(signer.changeOwnership).toHaveBeenCalledWith({ entityKey, nextOwnerAddress: ownerAddress });
  });
});
