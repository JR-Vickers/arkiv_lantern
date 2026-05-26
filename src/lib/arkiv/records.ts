import type { Entity, Hex } from "@arkiv-network/sdk";

import {
  MEMORY_BODY_ENCRYPTION_SCHEME,
  decryptMemoryBody,
  encryptMemoryBody,
  validateEncryptedMemoryBodyPayload,
  type EncryptedMemoryBodyPayload,
  type MemoryBodyCryptoOptions,
} from "../crypto/memoryEncryption";
import type { ArkivMutationBoundary, ArkivMutationReceipt, ArkivReadClient } from "./client";
import {
  CONTENT_TYPE_JSON,
  ENTITY_TYPES,
  MEMORY_BODY_LIMIT_CHARS,
  SCHEMA_VERSION,
  assertValidProjectAttributes,
  buildMemoryRecordQuery,
  createMemoryRecordEntityDraft,
  isTagAttributeKey,
  normalizeTags,
  type ArkivAttribute,
  type ArkivEntityDraft,
  type EncryptedMemoryRecordPayload,
  type MemoryRecordPayload,
  type MemoryRecordPayloadDraft,
} from "./contract";

export const MEMORY_RECORD_TITLE_LIMIT_CHARS = 140;
export const MEMORY_RECORD_SOURCE_LIMIT_CHARS = 500;
export const MEMORY_RECORD_TAG_LIMIT = 12;
export const MEMORY_RECORD_TAG_LIMIT_CHARS = 40;

export type MemoryRecordImportance = MemoryRecordPayload["importance"];

export interface MemoryRecordFormInput {
  body: string;
  encryptionEnabled?: boolean;
  encryptionPassphrase?: string;
  importance: MemoryRecordImportance;
  publicTestnetAcknowledged: boolean;
  source?: string;
  tags: string;
  title: string;
}

export interface ValidatedMemoryRecordInput {
  body: string;
  encryption: { enabled: false } | { enabled: true; passphrase: string };
  importance: MemoryRecordImportance;
  source?: string;
  tags: string[];
  title: string;
}

export type MemoryRecordField = keyof MemoryRecordFormInput | "ownerAddress" | "profileEntityKey";
export type MemoryRecordFieldErrors = Partial<Record<MemoryRecordField, string>>;

export interface CreateMemoryRecordInput extends MemoryRecordFormInput {
  ownerAddress: string;
  profileEntityKey: string;
}

export interface UpdateMemoryRecordInput extends MemoryRecordFormInput {
  ownerAddress: string;
  record: MemoryRecord;
}

export interface DeleteMemoryRecordInput {
  ownerAddress: string;
  record: MemoryRecord;
}

export interface ListMemoryRecordsInput {
  ownerAddress: string;
  profileEntityKey: string;
  tag?: string;
}

export interface ReadMemoryRecordInput {
  entityKey: Hex;
}

export interface MemoryRecord {
  attributes: ArkivAttribute[];
  contentType: string | undefined;
  createdAtBlock: bigint | undefined;
  creatorAddress: string | undefined;
  entityKey: Hex;
  expiresAtBlock: bigint | undefined;
  ownerAddress: string | undefined;
  payload: MemoryRecordPayload;
}

export interface CreateMemoryRecordResult extends ArkivMutationReceipt {
  draft: ArkivEntityDraft<MemoryRecordPayload>;
}

export interface UpdateMemoryRecordResult extends ArkivMutationReceipt {
  draft: ArkivEntityDraft<MemoryRecordPayload>;
}

export interface MemoryRecordRepository {
  createRecord(input: CreateMemoryRecordInput): Promise<CreateMemoryRecordResult>;
  deleteRecord(input: DeleteMemoryRecordInput): Promise<ArkivMutationReceipt>;
  listRecords(input: ListMemoryRecordsInput): Promise<MemoryRecord[]>;
  readRecord(input: ReadMemoryRecordInput): Promise<MemoryRecord>;
  updateRecord(input: UpdateMemoryRecordInput): Promise<UpdateMemoryRecordResult>;
}

export interface CreateMemoryRecordDraftInput {
  crypto?: MemoryBodyCryptoOptions;
  input: CreateMemoryRecordInput;
  now?: () => Date;
}

export interface UpdateMemoryRecordDraftInput {
  crypto?: MemoryBodyCryptoOptions;
  input: UpdateMemoryRecordInput;
  now?: () => Date;
}

export interface ArkivMemoryRecordRepositoryOptions {
  crypto?: MemoryBodyCryptoOptions;
  mutations: ArkivMutationBoundary;
  now?: () => Date;
  readClient: ArkivReadClient;
}

export class MemoryRecordValidationError extends Error {
  readonly fieldErrors: MemoryRecordFieldErrors;

  constructor(fieldErrors: MemoryRecordFieldErrors) {
    super("Memory record input is invalid.");
    this.name = "MemoryRecordValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class MemoryRecordEntityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryRecordEntityError";
  }
}

export class MemoryRecordAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryRecordAuthorizationError";
  }
}

export function validateMemoryRecordInput(input: MemoryRecordFormInput): ValidatedMemoryRecordInput {
  const title = input.title.trim();
  const body = input.body.trim();
  const source = input.source?.trim();
  const tags = parseTagText(input.tags);
  const encryptionEnabled = Boolean(input.encryptionEnabled);
  const encryptionPassphrase = input.encryptionPassphrase ?? "";
  const fieldErrors: MemoryRecordFieldErrors = {};

  if (!title) {
    fieldErrors.title = "Title is required.";
  } else if (title.length > MEMORY_RECORD_TITLE_LIMIT_CHARS) {
    fieldErrors.title = `Title must be ${MEMORY_RECORD_TITLE_LIMIT_CHARS} characters or fewer.`;
  }

  if (!body) {
    fieldErrors.body = "Body is required.";
  } else if (body.length > MEMORY_BODY_LIMIT_CHARS) {
    fieldErrors.body = `Body must be ${MEMORY_BODY_LIMIT_CHARS} characters or fewer.`;
  }

  if (source && source.length > MEMORY_RECORD_SOURCE_LIMIT_CHARS) {
    fieldErrors.source = `Source must be ${MEMORY_RECORD_SOURCE_LIMIT_CHARS} characters or fewer.`;
  }

  if (!isMemoryRecordImportance(input.importance)) {
    fieldErrors.importance = "Importance must be low, medium, or high.";
  }

  if (encryptionEnabled && !encryptionPassphrase.trim()) {
    fieldErrors.encryptionPassphrase = "Passphrase is required to encrypt this memory body.";
  }

  if (!encryptionEnabled && !input.publicTestnetAcknowledged) {
    fieldErrors.publicTestnetAcknowledged = "Acknowledge the public Braga testnet warning before submitting.";
  }

  if (tags.length > MEMORY_RECORD_TAG_LIMIT) {
    fieldErrors.tags = `Use ${MEMORY_RECORD_TAG_LIMIT} tags or fewer.`;
  } else {
    const tooLongTag = tags.find((tag) => tag.length > MEMORY_RECORD_TAG_LIMIT_CHARS);
    if (tooLongTag) {
      fieldErrors.tags = `Tag "${tooLongTag}" must be ${MEMORY_RECORD_TAG_LIMIT_CHARS} characters or fewer.`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new MemoryRecordValidationError(fieldErrors);
  }

  const encryption = encryptionEnabled
    ? ({ enabled: true, passphrase: encryptionPassphrase } as const)
    : ({ enabled: false } as const);

  return source
    ? { body, encryption, importance: input.importance, source, tags, title }
    : { body, encryption, importance: input.importance, tags, title };
}

export function parseTagText(tagText: string): string[] {
  return normalizeTags(tagText.split(","));
}

async function createMemoryRecordPayloadDraft({
  crypto,
  createdAt,
  profileEntityKey,
  updatedAt,
  validated,
}: {
  crypto?: MemoryBodyCryptoOptions;
  createdAt: string;
  profileEntityKey: string;
  updatedAt: string;
  validated: ValidatedMemoryRecordInput;
}): Promise<MemoryRecordPayloadDraft> {
  const basePayload = {
    createdAt,
    importance: validated.importance,
    profileEntityKey,
    tags: validated.tags,
    title: validated.title,
    updatedAt,
    ...(validated.source ? { source: validated.source } : {}),
  };

  if (!validated.encryption.enabled) {
    return {
      ...basePayload,
      body: validated.body,
    };
  }

  return {
    ...basePayload,
    encryptedBody: await encryptMemoryBody(validated.body, validated.encryption.passphrase, crypto),
    encryption: {
      enabled: true,
      mode: "passphrase",
      plaintextMetadata: ["title", "tags", "source", "importance"],
      scheme: MEMORY_BODY_ENCRYPTION_SCHEME,
    },
  };
}

export async function createMemoryRecordDraftFromInput({
  crypto,
  input,
  now = () => new Date(),
}: CreateMemoryRecordDraftInput): Promise<ArkivEntityDraft<MemoryRecordPayload>> {
  const ownerAddress = input.ownerAddress.trim();
  const profileEntityKey = input.profileEntityKey.trim();
  const fieldErrors: MemoryRecordFieldErrors = {};

  if (!ownerAddress) {
    fieldErrors.ownerAddress = "A connected owner wallet is required.";
  }

  if (!profileEntityKey) {
    fieldErrors.profileEntityKey = "Select a memory profile before creating a record.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new MemoryRecordValidationError(fieldErrors);
  }

  const validated = validateMemoryRecordInput(input);
  const timestamp = now().toISOString();
  const payload = await createMemoryRecordPayloadDraft({
    crypto,
    createdAt: timestamp,
    profileEntityKey,
    updatedAt: timestamp,
    validated,
  });

  return createMemoryRecordEntityDraft(payload, ownerAddress);
}

export async function createMemoryRecordUpdateDraftFromInput({
  crypto,
  input,
  now = () => new Date(),
}: UpdateMemoryRecordDraftInput): Promise<ArkivEntityDraft<MemoryRecordPayload>> {
  const ownerAddress = input.ownerAddress.trim();

  if (!ownerAddress) {
    throw new MemoryRecordValidationError({ ownerAddress: "A connected owner wallet is required." });
  }

  assertRecordOwnedBy(input.record, ownerAddress);

  const validated = validateMemoryRecordInput(input);
  const updatedAt = createChangedIsoTimestamp(now, input.record.payload.updatedAt);
  const payload = await createMemoryRecordPayloadDraft({
    crypto,
    createdAt: input.record.payload.createdAt,
    profileEntityKey: input.record.payload.profileEntityKey,
    updatedAt,
    validated,
  });

  return createMemoryRecordEntityDraft(payload, ownerAddress);
}

export function createArkivMemoryRecordRepository({
  crypto,
  mutations,
  now,
  readClient,
}: ArkivMemoryRecordRepositoryOptions): MemoryRecordRepository {
  return {
    async createRecord(input: CreateMemoryRecordInput) {
      const draft = await createMemoryRecordDraftFromInput({ crypto, input, now });
      const receipt = await mutations.createEntity(draft);
      return { ...receipt, draft };
    },
    async deleteRecord(input: DeleteMemoryRecordInput) {
      assertRecordOwnedBy(input.record, input.ownerAddress);
      return mutations.deleteEntity({ entityKey: input.record.entityKey });
    },
    async listRecords(input: ListMemoryRecordsInput) {
      const query = buildMemoryRecordQuery({
        ownerAddress: input.ownerAddress,
        profileEntityKey: input.profileEntityKey,
        tag: input.tag,
      });
      const result = await readClient.queryEntities({
        options: {
          includeData: {
            attributes: true,
            metadata: true,
            payload: true,
          },
          orderBy: [{ desc: "desc", name: "createdAt", type: "string" }],
        },
        query,
      });

      return result.entities.map(parseMemoryRecordEntity).sort(compareRecordsByCreatedAtDesc);
    },
    async readRecord(input: ReadMemoryRecordInput) {
      const entity = await readClient.readEntity({ entityKey: input.entityKey });
      return parseMemoryRecordEntity(entity);
    },
    async updateRecord(input: UpdateMemoryRecordInput) {
      const draft = await createMemoryRecordUpdateDraftFromInput({ crypto, input, now });
      const receipt = await mutations.updateEntity({ entityKey: input.record.entityKey, draft });
      return { ...receipt, draft };
    },
  };
}

export function isEncryptedMemoryRecordPayload(payload: MemoryRecordPayload): payload is EncryptedMemoryRecordPayload {
  return "encryptedBody" in payload && Boolean(payload.encryptedBody);
}

export function isEncryptedMemoryRecord(
  record: MemoryRecord,
): record is MemoryRecord & { payload: EncryptedMemoryRecordPayload } {
  return isEncryptedMemoryRecordPayload(record.payload);
}

export function getMemoryRecordBodyPreview(record: MemoryRecord): string {
  return isEncryptedMemoryRecord(record)
    ? "Encrypted body locked. Decrypt from the detail view to reveal it."
    : (record.payload.body ?? "");
}

export async function decryptMemoryRecordBody(
  record: MemoryRecord,
  passphrase: string,
  options?: Pick<MemoryBodyCryptoOptions, "crypto">,
): Promise<string> {
  if (!isEncryptedMemoryRecordPayload(record.payload)) {
    return record.payload.body ?? "";
  }

  return decryptMemoryBody(record.payload.encryptedBody, passphrase, options);
}

export function parseMemoryRecordEntity(entity: Entity): MemoryRecord {
  assertValidProjectAttributes(entity.attributes);
  assertMemoryRecordEntityType(entity.attributes);

  if (entity.contentType && entity.contentType !== CONTENT_TYPE_JSON) {
    throw new MemoryRecordEntityError(`Expected ${CONTENT_TYPE_JSON} memory_record payload.`);
  }

  const rawPayload = readEntityJson(entity);
  const payload = parseMemoryRecordPayload(rawPayload);
  assertRecordRelationshipAttributes(entity.attributes, payload);

  return {
    attributes: [...entity.attributes],
    contentType: entity.contentType,
    createdAtBlock: entity.createdAtBlock,
    creatorAddress: entity.creator,
    entityKey: entity.key,
    expiresAtBlock: entity.expiresAtBlock,
    ownerAddress: entity.owner,
    payload,
  };
}

function assertMemoryRecordEntityType(attributes: ReadonlyArray<ArkivAttribute>): void {
  const entityType = findStringAttribute(attributes, "entityType");

  if (entityType !== ENTITY_TYPES.memoryRecord) {
    throw new MemoryRecordEntityError("Arkiv entity is not a memory_record.");
  }
}

function assertRecordRelationshipAttributes(
  attributes: ReadonlyArray<ArkivAttribute>,
  payload: MemoryRecordPayload,
): void {
  const profileEntityKey = findStringAttribute(attributes, "profileEntityKey");
  const ownerAddress = findStringAttribute(attributes, "ownerAddress");
  const indexedTags = attributes.filter((attribute) => isTagAttributeKey(attribute.key)).map((attribute) => String(attribute.value));

  if (!ownerAddress) {
    throw new MemoryRecordEntityError("memory_record is missing ownerAddress attribute.");
  }

  if (!profileEntityKey) {
    throw new MemoryRecordEntityError("memory_record is missing profileEntityKey attribute.");
  }

  if (profileEntityKey !== payload.profileEntityKey) {
    throw new MemoryRecordEntityError("memory_record profileEntityKey attribute does not match payload.");
  }

  for (const tag of payload.tags) {
    if (!indexedTags.includes(tag)) {
      throw new MemoryRecordEntityError(`memory_record is missing indexed tag attribute "${tag}".`);
    }
  }
}

function compareRecordsByCreatedAtDesc(left: MemoryRecord, right: MemoryRecord): number {
  return right.payload.createdAt.localeCompare(left.payload.createdAt);
}

function assertRecordOwnedBy(record: MemoryRecord, ownerAddress: string): void {
  const recordOwner = record.ownerAddress;
  const requestedOwner = ownerAddress.trim();

  if (!recordOwner || !requestedOwner || !addressesEqual(recordOwner, requestedOwner)) {
    throw new MemoryRecordAuthorizationError(
      `Authorization failed: selected memory_record is owned by ${recordOwner ?? "an unknown Arkiv $owner"}, not ${requestedOwner || "the connected wallet"}.`,
    );
  }
}

function addressesEqual(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function createChangedIsoTimestamp(now: () => Date, previousTimestamp: string): string {
  const timestamp = now().toISOString();

  if (timestamp !== previousTimestamp) {
    return timestamp;
  }

  const previousTime = Date.parse(previousTimestamp);
  return Number.isNaN(previousTime) ? timestamp : new Date(previousTime + 1).toISOString();
}

function parseMemoryRecordPayload(rawPayload: unknown): MemoryRecordPayload {
  if (!isRecord(rawPayload)) {
    throw new MemoryRecordEntityError("Memory record payload must be a JSON object.");
  }

  const schemaVersion = requireString(rawPayload, "schemaVersion");
  const profileEntityKey = requireString(rawPayload, "profileEntityKey");
  const title = requireString(rawPayload, "title");
  const createdAt = requireString(rawPayload, "createdAt");
  const updatedAt = requireString(rawPayload, "updatedAt");
  const source = optionalString(rawPayload, "source");
  const importance = requireImportance(rawPayload);
  const tags = requireTags(rawPayload);
  const encryptedBody = optionalEncryptedBody(rawPayload);

  if (schemaVersion !== SCHEMA_VERSION) {
    throw new MemoryRecordEntityError(`Unsupported memory_record schemaVersion ${schemaVersion}.`);
  }

  if (encryptedBody) {
    assertNoEncryptedBodyPlaintext(rawPayload);
    return source
      ? {
          createdAt,
          encryptedBody,
          encryption: requireEncryptionMetadata(rawPayload),
          importance,
          profileEntityKey,
          schemaVersion: SCHEMA_VERSION,
          source,
          tags,
          title,
          updatedAt,
        }
      : {
          createdAt,
          encryptedBody,
          encryption: requireEncryptionMetadata(rawPayload),
          importance,
          profileEntityKey,
          schemaVersion: SCHEMA_VERSION,
          tags,
          title,
          updatedAt,
        };
  }

  const body = requireString(rawPayload, "body");

  return source
    ? {
        body,
        createdAt,
        importance,
        profileEntityKey,
        schemaVersion: SCHEMA_VERSION,
        source,
        tags,
        title,
        updatedAt,
      }
    : {
        body,
        createdAt,
        importance,
        profileEntityKey,
        schemaVersion: SCHEMA_VERSION,
        tags,
        title,
        updatedAt,
    };
}

function readEntityJson(entity: Entity): unknown {
  try {
    return entity.toJson();
  } catch (error) {
    throw new MemoryRecordEntityError(
      error instanceof Error ? error.message : "Memory record payload could not be decoded as JSON.",
    );
  }
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new MemoryRecordEntityError(`Memory record payload is missing required string field ${String(key)}.`);
  }

  return value;
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new MemoryRecordEntityError(`Memory record payload field ${String(key)} must be a string.`);
  }

  return value;
}

function optionalEncryptedBody(payload: Record<string, unknown>): EncryptedMemoryBodyPayload | undefined {
  const value = payload.encryptedBody;

  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new MemoryRecordEntityError("Encrypted memory record body must be a JSON object.");
  }

  try {
    const encryptedBody = value as unknown as EncryptedMemoryBodyPayload;
    validateEncryptedMemoryBodyPayload(encryptedBody);
    return encryptedBody;
  } catch (error) {
    throw new MemoryRecordEntityError(
      error instanceof Error ? error.message : "Encrypted memory record body is invalid.",
    );
  }
}

function requireEncryptionMetadata(payload: Record<string, unknown>): EncryptedMemoryRecordPayload["encryption"] {
  const encryption = payload.encryption;

  if (!isRecord(encryption)) {
    throw new MemoryRecordEntityError("Encrypted memory record is missing encryption metadata.");
  }

  if (
    encryption.enabled !== true ||
    encryption.mode !== "passphrase" ||
    encryption.scheme !== MEMORY_BODY_ENCRYPTION_SCHEME ||
    !Array.isArray(encryption.plaintextMetadata) ||
    encryption.plaintextMetadata.some((item) => typeof item !== "string")
  ) {
    throw new MemoryRecordEntityError("Encrypted memory record encryption metadata is invalid.");
  }

  return {
    enabled: true,
    mode: "passphrase",
    plaintextMetadata: ["title", "tags", "source", "importance"],
    scheme: MEMORY_BODY_ENCRYPTION_SCHEME,
  };
}

function assertNoEncryptedBodyPlaintext(payload: Record<string, unknown>): void {
  const body = payload.body;

  if (typeof body === "string" && body.trim()) {
    throw new MemoryRecordEntityError("Encrypted memory record payload must not include plaintext body.");
  }
}

function requireTags(payload: Record<string, unknown>): string[] {
  const tags = payload.tags;

  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
    throw new MemoryRecordEntityError("Memory record payload tags must be a string array.");
  }

  return normalizeTags(tags);
}

function requireImportance(payload: Record<string, unknown>): MemoryRecordImportance {
  const importance = payload.importance;

  if (!isMemoryRecordImportance(importance)) {
    throw new MemoryRecordEntityError("Memory record payload importance must be low, medium, or high.");
  }

  return importance;
}

function isMemoryRecordImportance(value: unknown): value is MemoryRecordImportance {
  return value === "low" || value === "medium" || value === "high";
}

function findStringAttribute(attributes: ReadonlyArray<ArkivAttribute>, key: string): string | undefined {
  const value = attributes.find((attribute) => attribute.key === key)?.value;
  return typeof value === "string" && value ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
