import {
  MEMORY_BODY_ENCRYPTION_SCHEME,
  type EncryptedMemoryBodyPayload,
} from "../crypto/memoryEncryption";

export {
  BRAGA_CHAIN_ID,
  BRAGA_EXPLORER_URL,
  BRAGA_NETWORK_NAME,
  BRAGA_RPC_URL,
  type ArkivConfig,
  ArkivConfigError,
  type ArkivConfigInput,
  resolveArkivConfig,
} from "./config";

export const PROJECT_ATTRIBUTE_KEY = "project";
export const PROJECT_ATTRIBUTE_VALUE = "arkiv-database-owned-memory-v1";

export const PROJECT_ATTRIBUTE = Object.freeze({
  key: PROJECT_ATTRIBUTE_KEY,
  value: PROJECT_ATTRIBUTE_VALUE,
} as const);

export const ENTITY_TYPES = {
  memoryProfile: "memory_profile",
  memoryRecord: "memory_record",
} as const;

export const CONTENT_TYPE_JSON = "application/json";
export const ENTITY_EXPIRES_IN_DAYS = 365;
export const ENTITY_EXPIRES_IN_SECONDS = ENTITY_EXPIRES_IN_DAYS * 24 * 60 * 60;
export const SCHEMA_VERSION = "1";
export const MEMORY_BODY_LIMIT_CHARS = 200_000;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

export interface ArkivStringAttribute {
  key: string;
  value: string;
}

export interface ArkivAttribute {
  key: string;
  value: number | string;
}

export interface ArkivEntityDraft<TPayload extends object> {
  payload: TPayload;
  contentType: typeof CONTENT_TYPE_JSON;
  attributes: ArkivStringAttribute[];
  expiresIn: number;
}

export interface MemoryProfilePayload {
  schemaVersion: typeof SCHEMA_VERSION;
  displayName: string;
  agentPurpose: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRecordBasePayload {
  schemaVersion: typeof SCHEMA_VERSION;
  profileEntityKey: string;
  title: string;
  source?: string;
  tags: string[];
  importance: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
}

export interface PlaintextMemoryRecordPayload extends MemoryRecordBasePayload {
  body: string;
  encryptedBody?: never;
  encryption?: {
    enabled: false;
  };
}

export interface MemoryRecordEncryptionMetadata {
  enabled: true;
  mode: "passphrase";
  plaintextMetadata: Array<"importance" | "source" | "tags" | "title">;
  scheme: typeof MEMORY_BODY_ENCRYPTION_SCHEME;
}

export interface EncryptedMemoryRecordPayload extends MemoryRecordBasePayload {
  body?: never;
  encryptedBody: EncryptedMemoryBodyPayload;
  encryption: MemoryRecordEncryptionMetadata;
}

export type MemoryRecordPayload = PlaintextMemoryRecordPayload | EncryptedMemoryRecordPayload;

export type MemoryRecordPayloadDraft =
  | (Omit<PlaintextMemoryRecordPayload, "schemaVersion" | "tags"> & { tags: string[] })
  | (Omit<EncryptedMemoryRecordPayload, "schemaVersion" | "tags"> & { tags: string[] });

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

export function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean))).sort();
}

export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export class ArkivProjectAttributeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArkivProjectAttributeError";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getProjectAttributeValues(attributes: ReadonlyArray<ArkivAttribute>): Array<number | string> {
  return attributes
    .filter((attribute) => attribute.key === PROJECT_ATTRIBUTE_KEY)
    .map((attribute) => attribute.value);
}

export function assertValidProjectAttributes(attributes: ReadonlyArray<ArkivAttribute>): void {
  const projectValues = getProjectAttributeValues(attributes);

  if (projectValues.length === 0) {
    throw new ArkivProjectAttributeError(
      `Missing required Arkiv project attribute ${PROJECT_ATTRIBUTE_KEY} = ${PROJECT_ATTRIBUTE_VALUE}.`,
    );
  }

  if (projectValues.length > 1) {
    throw new ArkivProjectAttributeError(
      `Expected exactly one Arkiv project attribute, found ${projectValues.length}.`,
    );
  }

  if (projectValues[0] !== PROJECT_ATTRIBUTE_VALUE) {
    throw new ArkivProjectAttributeError(
      `Invalid Arkiv project attribute value for ${PROJECT_ATTRIBUTE_KEY}.`,
    );
  }
}

export function assertProjectScopedEntityDraft<TPayload extends object>(
  draft: ArkivEntityDraft<TPayload>,
): ArkivEntityDraft<TPayload> {
  assertValidProjectAttributes(draft.attributes);
  return draft;
}

const PROJECT_ATTRIBUTE_QUERY_PATTERN = new RegExp(
  `(^|[^A-Za-z0-9_$])${escapeRegExp(PROJECT_ATTRIBUTE_KEY)}\\s*=\\s*"([^"]*)"`,
  "g",
);

function getQueryProjectAttributeValues(query: string): string[] {
  return Array.from(query.matchAll(PROJECT_ATTRIBUTE_QUERY_PATTERN), (match) => match[2]);
}

export function assertProjectScopedQuery(query: string): string {
  const projectValues = getQueryProjectAttributeValues(query);

  if (projectValues.length === 0) {
    throw new ArkivProjectAttributeError(
      `Missing required Arkiv query attribute ${PROJECT_ATTRIBUTE_KEY} = ${PROJECT_ATTRIBUTE_VALUE}.`,
    );
  }

  if (projectValues.length > 1) {
    throw new ArkivProjectAttributeError(
      `Expected exactly one Arkiv query project attribute, found ${projectValues.length}.`,
    );
  }

  if (projectValues[0] !== PROJECT_ATTRIBUTE_VALUE) {
    throw new ArkivProjectAttributeError(
      `Invalid Arkiv query project attribute value for ${PROJECT_ATTRIBUTE_KEY}.`,
    );
  }

  return query;
}

export function createBaseAttributes(entityType: EntityType, ownerAddress: string): ArkivStringAttribute[] {
  return [
    PROJECT_ATTRIBUTE,
    { key: "entityType", value: entityType },
    { key: "ownerAddress", value: ownerAddress },
    { key: "schemaVersion", value: SCHEMA_VERSION },
  ];
}

export function createMemoryProfileEntityDraft(
  payload: Omit<MemoryProfilePayload, "schemaVersion">,
  ownerAddress: string,
): ArkivEntityDraft<MemoryProfilePayload> {
  return assertProjectScopedEntityDraft({
    payload: { ...payload, schemaVersion: SCHEMA_VERSION },
    contentType: CONTENT_TYPE_JSON,
    expiresIn: ENTITY_EXPIRES_IN_SECONDS,
    attributes: [
      ...createBaseAttributes(ENTITY_TYPES.memoryProfile, ownerAddress),
      { key: "createdAt", value: payload.createdAt },
      { key: "updatedAt", value: payload.updatedAt },
    ],
  });
}

export function createMemoryRecordEntityDraft(
  payload: MemoryRecordPayloadDraft,
  ownerAddress: string,
): ArkivEntityDraft<MemoryRecordPayload> {
  const tags = normalizeTags(payload.tags);

  return assertProjectScopedEntityDraft({
    payload: { ...payload, tags, schemaVersion: SCHEMA_VERSION },
    contentType: CONTENT_TYPE_JSON,
    expiresIn: ENTITY_EXPIRES_IN_SECONDS,
    attributes: [
      ...createBaseAttributes(ENTITY_TYPES.memoryRecord, ownerAddress),
      { key: "profileEntityKey", value: payload.profileEntityKey },
      ...tags.map((tag) => ({ key: "tag", value: tag })),
      { key: "createdAt", value: payload.createdAt },
      { key: "updatedAt", value: payload.updatedAt },
    ],
  });
}

export function buildProfileQuery({ ownerAddress }: { ownerAddress: string }): string {
  return assertProjectScopedQuery([
    `${PROJECT_ATTRIBUTE_KEY} = "${PROJECT_ATTRIBUTE_VALUE}"`,
    `entityType = "${ENTITY_TYPES.memoryProfile}"`,
    `ownerAddress = "${escapeQueryValue(ownerAddress)}"`,
    `$owner = "${escapeQueryValue(ownerAddress)}"`,
  ].join(" && "));
}

export function buildMemoryRecordQuery({
  ownerAddress,
  profileEntityKey,
  tag,
}: {
  ownerAddress: string;
  profileEntityKey?: string;
  tag?: string;
}): string {
  const filters = [
    `${PROJECT_ATTRIBUTE_KEY} = "${PROJECT_ATTRIBUTE_VALUE}"`,
    `entityType = "${ENTITY_TYPES.memoryRecord}"`,
    `ownerAddress = "${escapeQueryValue(ownerAddress)}"`,
    `$owner = "${escapeQueryValue(ownerAddress)}"`,
  ];

  if (profileEntityKey) {
    filters.push(`profileEntityKey = "${escapeQueryValue(profileEntityKey)}"`);
  }

  if (tag) {
    filters.push(`tag = "${escapeQueryValue(normalizeTag(tag))}"`);
  }

  return assertProjectScopedQuery(filters.join(" && "));
}

export function hasProjectAttribute(attributes: ReadonlyArray<ArkivAttribute>): boolean {
  try {
    assertValidProjectAttributes(attributes);
    return true;
  } catch (error) {
    if (error instanceof ArkivProjectAttributeError) {
      return false;
    }

    throw error;
  }
}
