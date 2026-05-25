import {
  createPublicClient,
  http,
  type Entity,
  type Hash,
  type Hex,
  type QueryOptions,
  type QueryReturnType,
} from "@arkiv-network/sdk";

import {
  assertProjectScopedEntityDraft,
  assertProjectScopedQuery,
  assertValidProjectAttributes,
  type ArkivEntityDraft,
} from "./contract";
import { resolveArkivConfig, type ArkivConfig, type ArkivConfigInput } from "./config";

export interface ArkivPublicTransport {
  getEntity(entityKey: Hex): Promise<Entity>;
  query(query: string, options?: QueryOptions): Promise<QueryReturnType>;
}

export interface CreateArkivReadClientOptions {
  config?: ArkivConfigInput;
  transport?: ArkivPublicTransport;
}

export interface ReadEntityInput {
  entityKey: Hex;
}

export interface QueryEntitiesInput {
  options?: QueryOptions;
  query: string;
}

export interface ArkivReadClient {
  readonly config: ArkivConfig;
  queryEntities(input: QueryEntitiesInput): Promise<QueryReturnType>;
  readEntity(input: ReadEntityInput): Promise<Entity>;
}

export interface ArkivMutationReceipt {
  entityKey: Hex;
  txHash: Hash;
}

export interface UpdateEntityDraftInput<TPayload extends object> {
  draft: ArkivEntityDraft<TPayload>;
  entityKey: Hex;
}

export interface DeleteEntityInput {
  entityKey: Hex;
}

export interface ChangeOwnershipInput {
  entityKey: Hex;
  nextOwnerAddress: Hex;
}

export interface ArkivMutationSigner {
  changeOwnership?(input: ChangeOwnershipInput): Promise<ArkivMutationReceipt>;
  createEntity<TPayload extends object>(draft: ArkivEntityDraft<TPayload>): Promise<ArkivMutationReceipt>;
  deleteEntity(input: DeleteEntityInput): Promise<ArkivMutationReceipt>;
  updateEntity<TPayload extends object>(input: UpdateEntityDraftInput<TPayload>): Promise<ArkivMutationReceipt>;
}

export interface ArkivMutationBoundary {
  changeOwnership?(input: ChangeOwnershipInput): Promise<ArkivMutationReceipt>;
  createEntity<TPayload extends object>(draft: ArkivEntityDraft<TPayload>): Promise<ArkivMutationReceipt>;
  deleteEntity(input: DeleteEntityInput): Promise<ArkivMutationReceipt>;
  updateEntity<TPayload extends object>(input: UpdateEntityDraftInput<TPayload>): Promise<ArkivMutationReceipt>;
}

export function createArkivPublicTransport(config: ArkivConfig = resolveArkivConfig()): ArkivPublicTransport {
  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });
}

export function createArkivReadClient(options: CreateArkivReadClientOptions = {}): ArkivReadClient {
  const config = resolveArkivConfig(options.config);
  const transport = options.transport ?? createArkivPublicTransport(config);

  return {
    config,
    async queryEntities(input: QueryEntitiesInput) {
      const query = assertProjectScopedQuery(input.query);
      const result = await transport.query(query, withRequiredQueryIncludes(input.options));
      result.entities.forEach(assertProjectScopedEntity);
      return result;
    },
    async readEntity(input: ReadEntityInput) {
      const entity = await transport.getEntity(input.entityKey);
      assertProjectScopedEntity(entity);
      return entity;
    },
  };
}

export function createProjectScopedMutationBoundary(signer: ArkivMutationSigner): ArkivMutationBoundary {
  return {
    ...(signer.changeOwnership && {
      changeOwnership: async (input: ChangeOwnershipInput) => signer.changeOwnership?.(input) ?? missingSignerMethod(),
    }),
    async createEntity<TPayload extends object>(draft: ArkivEntityDraft<TPayload>) {
      return signer.createEntity(assertProjectScopedEntityDraft(draft));
    },
    async deleteEntity(input: DeleteEntityInput) {
      return signer.deleteEntity(input);
    },
    async updateEntity<TPayload extends object>(input: UpdateEntityDraftInput<TPayload>) {
      return signer.updateEntity({
        ...input,
        draft: assertProjectScopedEntityDraft(input.draft),
      });
    },
  };
}

function withRequiredQueryIncludes(options?: QueryOptions): QueryOptions {
  return {
    ...options,
    includeData: {
      payload: options?.includeData?.payload ?? true,
      metadata: options?.includeData?.metadata ?? true,
      attributes: true,
    },
  };
}

function assertProjectScopedEntity(entity: Entity): void {
  assertValidProjectAttributes(entity.attributes);
}

function missingSignerMethod(): never {
  throw new Error("Arkiv mutation signer method is unavailable.");
}
