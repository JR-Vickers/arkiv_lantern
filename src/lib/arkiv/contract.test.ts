import { describe, expect, it } from "vitest";

import {
  ArkivConfigError,
  ArkivProjectAttributeError,
  BRAGA_RPC_URL,
  CONTENT_TYPE_JSON,
  ENTITY_EXPIRES_IN_SECONDS,
  PROJECT_ATTRIBUTE_KEY,
  PROJECT_ATTRIBUTE_VALUE,
  assertProjectScopedEntityDraft,
  assertProjectScopedQuery,
  assertValidProjectAttributes,
  buildMemoryRecordQuery,
  buildProfileQuery,
  createTagAttributeKey,
  createMemoryProfileEntityDraft,
  createMemoryRecordEntityDraft,
  hasProjectAttribute,
  normalizeTags,
  resolveArkivConfig,
} from "./contract";

const ownerAddress = "0x2222222222222222222222222222222222222222";
const now = "2026-05-23T00:00:00.000Z";

describe("Arkiv contract guardrails", () => {
  it("targets Braga testnet", () => {
    expect(BRAGA_RPC_URL).toBe("https://braga.hoodi.arkiv.network/rpc");
  });

  it("fails loudly when required Braga config is missing", () => {
    expect(() => resolveArkivConfig({ rpcUrl: "" })).toThrow(ArkivConfigError);
    expect(() => resolveArkivConfig({ explorerUrl: " " })).toThrow(ArkivConfigError);
  });

  it("builds memory_profile drafts with project attribute, content type, and expiry", () => {
    const draft = createMemoryProfileEntityDraft(
      {
        displayName: "Demo Agent",
        agentPurpose: "Remember user-owned preferences",
        createdAt: now,
        updatedAt: now,
      },
      ownerAddress,
    );

    expect(draft.contentType).toBe(CONTENT_TYPE_JSON);
    expect(draft.expiresIn).toBe(ENTITY_EXPIRES_IN_SECONDS);
    expect(hasProjectAttribute(draft.attributes)).toBe(true);
    expect(draft.attributes).toContainEqual({ key: "entityType", value: "memory_profile" });
    expect(draft.attributes).toContainEqual({ key: "ownerAddress", value: ownerAddress });
  });

  it("builds memory_record drafts with relationship and normalized tag attributes", () => {
    const draft = createMemoryRecordEntityDraft(
      {
        profileEntityKey: "profile_123",
        title: "Style preference",
        body: "The user prefers concise implementation notes.",
        source: "manual",
        tags: ["Preference", " Project ", "preference"],
        importance: "medium",
        createdAt: now,
        updatedAt: now,
      },
      ownerAddress,
    );

    expect(draft.contentType).toBe(CONTENT_TYPE_JSON);
    expect(draft.expiresIn).toBe(ENTITY_EXPIRES_IN_SECONDS);
    expect(hasProjectAttribute(draft.attributes)).toBe(true);
    expect(draft.attributes).toContainEqual({ key: "entityType", value: "memory_record" });
    expect(draft.attributes).toContainEqual({ key: "profileEntityKey", value: "profile_123" });
    expect(draft.attributes).toContainEqual({ key: createTagAttributeKey("preference"), value: "preference" });
    expect(draft.attributes).toContainEqual({ key: createTagAttributeKey("project"), value: "project" });
    expect(draft.attributes.map((attribute) => attribute.key)).not.toContain("tag");
    expect(new Set(draft.attributes.map((attribute) => attribute.key)).size).toBe(draft.attributes.length);
    expect(draft.payload.tags).toEqual(["preference", "project"]);
  });

  it("normalizes tags deterministically", () => {
    expect(normalizeTags([" Project Context ", "project context", ""])).toEqual(["project-context"]);
  });

  it("rejects entity attributes with a missing project attribute", () => {
    expect(() =>
      assertValidProjectAttributes([
        { key: "entityType", value: "memory_profile" },
        { key: "ownerAddress", value: ownerAddress },
      ]),
    ).toThrow(ArkivProjectAttributeError);
  });

  it("rejects entity attributes with an invalid project attribute value", () => {
    expect(() =>
      assertValidProjectAttributes([
        { key: PROJECT_ATTRIBUTE_KEY, value: "another-project" },
        { key: "entityType", value: "memory_profile" },
      ]),
    ).toThrow(ArkivProjectAttributeError);
  });

  it("rejects entity attributes with duplicate project attributes", () => {
    expect(() =>
      assertValidProjectAttributes([
        { key: PROJECT_ATTRIBUTE_KEY, value: PROJECT_ATTRIBUTE_VALUE },
        { key: PROJECT_ATTRIBUTE_KEY, value: PROJECT_ATTRIBUTE_VALUE },
      ]),
    ).toThrow(ArkivProjectAttributeError);
  });

  it("rejects entity drafts with missing project attributes before signing", () => {
    const draft = createMemoryProfileEntityDraft(
      {
        displayName: "Demo Agent",
        agentPurpose: "Remember user-owned preferences",
        createdAt: now,
        updatedAt: now,
      },
      ownerAddress,
    );

    expect(() =>
      assertProjectScopedEntityDraft({
        ...draft,
        attributes: draft.attributes.filter((attribute) => attribute.key !== PROJECT_ATTRIBUTE_KEY),
      }),
    ).toThrow(ArkivProjectAttributeError);
  });

  it("builds owner-scoped profile queries", () => {
    const query = buildProfileQuery({ ownerAddress });

    expect(query).toContain(`${PROJECT_ATTRIBUTE_KEY} = "${PROJECT_ATTRIBUTE_VALUE}"`);
    expect(query).toContain('entityType = "memory_profile"');
    expect(query).toContain(`ownerAddress = "${ownerAddress}"`);
    expect(query).toContain(`$owner = "${ownerAddress}"`);
  });

  it("rejects queries that omit the project attribute", () => {
    expect(() => assertProjectScopedQuery('entityType = "memory_profile"')).toThrow(
      ArkivProjectAttributeError,
    );
  });

  it("rejects queries with the wrong project attribute value", () => {
    expect(() => assertProjectScopedQuery('project = "another-project" && entityType = "memory_profile"')).toThrow(
      ArkivProjectAttributeError,
    );
  });

  it("rejects queries with duplicate project attributes", () => {
    expect(() =>
      assertProjectScopedQuery(
        `project = "${PROJECT_ATTRIBUTE_VALUE}" && project = "${PROJECT_ATTRIBUTE_VALUE}" && entityType = "memory_profile"`,
      ),
    ).toThrow(ArkivProjectAttributeError);
  });

  it("builds owner, profile, and tag-scoped memory record queries", () => {
    const query = buildMemoryRecordQuery({
      ownerAddress,
      profileEntityKey: "profile_123",
      tag: "Project Context",
    });

    expect(query).toContain(`${PROJECT_ATTRIBUTE_KEY} = "${PROJECT_ATTRIBUTE_VALUE}"`);
    expect(query).toContain('entityType = "memory_record"');
    expect(query).toContain(`ownerAddress = "${ownerAddress}"`);
    expect(query).toContain(`$owner = "${ownerAddress}"`);
    expect(query).toContain('profileEntityKey = "profile_123"');
    expect(query).toContain(`${createTagAttributeKey("project-context")} = "project-context"`);
  });

  it("reports invalid project attributes as absent", () => {
    expect(hasProjectAttribute([{ key: PROJECT_ATTRIBUTE_KEY, value: "another-project" }])).toBe(false);
    expect(hasProjectAttribute([])).toBe(false);
  });
});
