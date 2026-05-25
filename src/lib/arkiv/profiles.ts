import type { Entity, Hex } from "@arkiv-network/sdk";

import type { ArkivMutationBoundary, ArkivMutationReceipt, ArkivReadClient } from "./client";
import {
  CONTENT_TYPE_JSON,
  ENTITY_TYPES,
  SCHEMA_VERSION,
  assertValidProjectAttributes,
  buildProfileQuery,
  createMemoryProfileEntityDraft,
  type ArkivAttribute,
  type ArkivEntityDraft,
  type MemoryProfilePayload,
} from "./contract";

export const PROFILE_DISPLAY_NAME_LIMIT_CHARS = 80;
export const PROFILE_AGENT_PURPOSE_LIMIT_CHARS = 280;
export const PROFILE_NOTES_LIMIT_CHARS = 1_000;

export interface MemoryProfileFormInput {
  agentPurpose: string;
  displayName: string;
  notes?: string;
}

export type MemoryProfileField = keyof MemoryProfileFormInput;
export type MemoryProfileFieldErrors = Partial<Record<MemoryProfileField, string>>;

export interface CreateMemoryProfileInput extends MemoryProfileFormInput {
  ownerAddress: string;
}

export interface UpdateMemoryProfileInput extends MemoryProfileFormInput {
  ownerAddress: string;
  profile: MemoryProfile;
}

export interface DeleteMemoryProfileInput {
  ownerAddress: string;
  profile: MemoryProfile;
}

export interface ListMemoryProfilesInput {
  ownerAddress: string;
}

export interface ReadMemoryProfileInput {
  entityKey: Hex;
}

export interface MemoryProfile {
  attributes: ArkivAttribute[];
  contentType: string | undefined;
  createdAtBlock: bigint | undefined;
  creatorAddress: string | undefined;
  entityKey: Hex;
  expiresAtBlock: bigint | undefined;
  ownerAddress: string | undefined;
  payload: MemoryProfilePayload;
}

export interface CreateMemoryProfileResult extends ArkivMutationReceipt {
  draft: ArkivEntityDraft<MemoryProfilePayload>;
}

export interface UpdateMemoryProfileResult extends ArkivMutationReceipt {
  draft: ArkivEntityDraft<MemoryProfilePayload>;
}

export interface MemoryProfileRepository {
  createProfile(input: CreateMemoryProfileInput): Promise<CreateMemoryProfileResult>;
  deleteProfile(input: DeleteMemoryProfileInput): Promise<ArkivMutationReceipt>;
  listProfiles(input: ListMemoryProfilesInput): Promise<MemoryProfile[]>;
  readProfile(input: ReadMemoryProfileInput): Promise<MemoryProfile>;
  updateProfile(input: UpdateMemoryProfileInput): Promise<UpdateMemoryProfileResult>;
}

export interface CreateMemoryProfileDraftInput {
  input: CreateMemoryProfileInput;
  now?: () => Date;
}

export interface UpdateMemoryProfileDraftInput {
  input: UpdateMemoryProfileInput;
  now?: () => Date;
}

export interface ArkivMemoryProfileRepositoryOptions {
  mutations: ArkivMutationBoundary;
  now?: () => Date;
  readClient: ArkivReadClient;
}

export class MemoryProfileValidationError extends Error {
  readonly fieldErrors: MemoryProfileFieldErrors;

  constructor(fieldErrors: MemoryProfileFieldErrors) {
    super("Memory profile input is invalid.");
    this.name = "MemoryProfileValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class MemoryProfileEntityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryProfileEntityError";
  }
}

export class MemoryProfileAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryProfileAuthorizationError";
  }
}

export function validateMemoryProfileInput(input: MemoryProfileFormInput): MemoryProfileFormInput {
  const displayName = input.displayName.trim();
  const agentPurpose = input.agentPurpose.trim();
  const notes = input.notes?.trim();
  const fieldErrors: MemoryProfileFieldErrors = {};

  if (!displayName) {
    fieldErrors.displayName = "Display name is required.";
  } else if (displayName.length > PROFILE_DISPLAY_NAME_LIMIT_CHARS) {
    fieldErrors.displayName = `Display name must be ${PROFILE_DISPLAY_NAME_LIMIT_CHARS} characters or fewer.`;
  }

  if (!agentPurpose) {
    fieldErrors.agentPurpose = "Agent purpose is required.";
  } else if (agentPurpose.length > PROFILE_AGENT_PURPOSE_LIMIT_CHARS) {
    fieldErrors.agentPurpose = `Agent purpose must be ${PROFILE_AGENT_PURPOSE_LIMIT_CHARS} characters or fewer.`;
  }

  if (notes && notes.length > PROFILE_NOTES_LIMIT_CHARS) {
    fieldErrors.notes = `Notes must be ${PROFILE_NOTES_LIMIT_CHARS} characters or fewer.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new MemoryProfileValidationError(fieldErrors);
  }

  return notes ? { agentPurpose, displayName, notes } : { agentPurpose, displayName };
}

export function createMemoryProfileDraftFromInput({
  input,
  now = () => new Date(),
}: CreateMemoryProfileDraftInput): ArkivEntityDraft<MemoryProfilePayload> {
  const ownerAddress = input.ownerAddress.trim();

  if (!ownerAddress) {
    throw new MemoryProfileValidationError({ displayName: "A connected owner wallet is required." });
  }

  const validated = validateMemoryProfileInput(input);
  const timestamp = now().toISOString();

  return createMemoryProfileEntityDraft(
    {
      ...validated,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    ownerAddress,
  );
}

export function createMemoryProfileUpdateDraftFromInput({
  input,
  now = () => new Date(),
}: UpdateMemoryProfileDraftInput): ArkivEntityDraft<MemoryProfilePayload> {
  const ownerAddress = input.ownerAddress.trim();

  if (!ownerAddress) {
    throw new MemoryProfileValidationError({ displayName: "A connected owner wallet is required." });
  }

  assertProfileOwnedBy(input.profile, ownerAddress);

  const validated = validateMemoryProfileInput(input);
  const updatedAt = createChangedIsoTimestamp(now, input.profile.payload.updatedAt);

  return createMemoryProfileEntityDraft(
    {
      ...validated,
      createdAt: input.profile.payload.createdAt,
      updatedAt,
    },
    ownerAddress,
  );
}

export function createArkivMemoryProfileRepository({
  mutations,
  now,
  readClient,
}: ArkivMemoryProfileRepositoryOptions): MemoryProfileRepository {
  return {
    async createProfile(input: CreateMemoryProfileInput) {
      const draft = createMemoryProfileDraftFromInput({ input, now });
      const receipt = await mutations.createEntity(draft);
      return { ...receipt, draft };
    },
    async deleteProfile(input: DeleteMemoryProfileInput) {
      assertProfileOwnedBy(input.profile, input.ownerAddress);
      return mutations.deleteEntity({ entityKey: input.profile.entityKey });
    },
    async listProfiles(input: ListMemoryProfilesInput) {
      const query = buildProfileQuery({ ownerAddress: input.ownerAddress });
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

      return result.entities.map(parseMemoryProfileEntity).sort(compareProfilesByCreatedAtDesc);
    },
    async readProfile(input: ReadMemoryProfileInput) {
      const entity = await readClient.readEntity({ entityKey: input.entityKey });
      return parseMemoryProfileEntity(entity);
    },
    async updateProfile(input: UpdateMemoryProfileInput) {
      const draft = createMemoryProfileUpdateDraftFromInput({ input, now });
      const receipt = await mutations.updateEntity({ entityKey: input.profile.entityKey, draft });
      return { ...receipt, draft };
    },
  };
}

export function parseMemoryProfileEntity(entity: Entity): MemoryProfile {
  assertValidProjectAttributes(entity.attributes);
  assertMemoryProfileEntityType(entity.attributes);

  if (entity.contentType && entity.contentType !== CONTENT_TYPE_JSON) {
    throw new MemoryProfileEntityError(`Expected ${CONTENT_TYPE_JSON} profile payload.`);
  }

  const rawPayload = readEntityJson(entity);
  const payload = parseMemoryProfilePayload(rawPayload);

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

function assertMemoryProfileEntityType(attributes: ReadonlyArray<ArkivAttribute>): void {
  const entityType = attributes.find((attribute) => attribute.key === "entityType")?.value;

  if (entityType !== ENTITY_TYPES.memoryProfile) {
    throw new MemoryProfileEntityError("Arkiv entity is not a memory_profile.");
  }
}

function compareProfilesByCreatedAtDesc(left: MemoryProfile, right: MemoryProfile): number {
  return right.payload.createdAt.localeCompare(left.payload.createdAt);
}

function assertProfileOwnedBy(profile: MemoryProfile, ownerAddress: string): void {
  const profileOwner = profile.ownerAddress;
  const requestedOwner = ownerAddress.trim();

  if (!profileOwner || !requestedOwner || !addressesEqual(profileOwner, requestedOwner)) {
    throw new MemoryProfileAuthorizationError(
      `Authorization failed: selected memory_profile is owned by ${profileOwner ?? "an unknown Arkiv $owner"}, not ${requestedOwner || "the connected wallet"}.`,
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

function parseMemoryProfilePayload(rawPayload: unknown): MemoryProfilePayload {
  if (!isRecord(rawPayload)) {
    throw new MemoryProfileEntityError("Profile payload must be a JSON object.");
  }

  const schemaVersion = requireString(rawPayload, "schemaVersion");
  const displayName = requireString(rawPayload, "displayName");
  const agentPurpose = requireString(rawPayload, "agentPurpose");
  const createdAt = requireString(rawPayload, "createdAt");
  const updatedAt = requireString(rawPayload, "updatedAt");
  const notes = optionalString(rawPayload, "notes");

  if (schemaVersion !== SCHEMA_VERSION) {
    throw new MemoryProfileEntityError(`Unsupported memory_profile schemaVersion ${schemaVersion}.`);
  }

  return notes
    ? {
        agentPurpose,
        createdAt,
        displayName,
        notes,
        schemaVersion: SCHEMA_VERSION,
        updatedAt,
      }
    : {
        agentPurpose,
        createdAt,
        displayName,
        schemaVersion: SCHEMA_VERSION,
        updatedAt,
      };
}

function readEntityJson(entity: Entity): unknown {
  try {
    return entity.toJson();
  } catch (error) {
    throw new MemoryProfileEntityError(
      error instanceof Error ? error.message : "Profile payload could not be decoded as JSON.",
    );
  }
}

function requireString(payload: Record<string, unknown>, key: keyof MemoryProfilePayload): string {
  const value = payload[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new MemoryProfileEntityError(`Profile payload is missing required string field ${String(key)}.`);
  }

  return value;
}

function optionalString(payload: Record<string, unknown>, key: keyof MemoryProfilePayload): string | undefined {
  const value = payload[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new MemoryProfileEntityError(`Profile payload field ${String(key)} must be a string.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
