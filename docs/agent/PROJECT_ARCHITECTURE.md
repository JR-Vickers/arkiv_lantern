# Project Architecture

## Purpose

Build a web3-native application where all durable app data lives on Arkiv. Users own their data through Arkiv ownership semantics instead of the platform owning or controlling the data.

Assumption: The concrete app for this repository is an AI-themed app called "Arkiv Database: Owned Agent Memory." It lets users create, read, query, update, and delete user-owned AI memory records stored as Arkiv entities on the Braga testnet. Do not claim the Privacy theme unless client-side encryption is implemented, tested, and approved; otherwise the demo must warn users that Braga testnet memory bodies may be public and should contain non-sensitive demo data only.

## Current Repository State

Historical bootstrap notes in this document have been superseded by the implementation log. The current app uses TypeScript, Vite, React, npm, Vitest, ESLint, and the Arkiv SDK. Phase 5 owner-controlled update/delete workflows and write diagnostics are implemented, and Phase 6 adds opt-in encrypted `memory_record` handling while preserving plaintext demo records.

## Core Arkiv Requirements

Requirement: Every entity and query must include the unique project attribute. Assumption: the selected value is:

- `PROJECT_ATTRIBUTE_KEY`: `project`
- `PROJECT_ATTRIBUTE_VALUE`: `arkiv-database-owned-memory-v1`

Personal user views must also scope queries to the connected wallet's owner identity through `ownerAddress` and/or Arkiv `$owner` filters where supported. A public explorer view is out of scope unless the human explicitly approves it.

Required Arkiv concepts from `DESCRIPTION.md`:

- Entities contain a payload, typed attributes, content type, and `expiresIn` duration.
- Metadata includes `$owner`, which controls update/delete, and `$creator`, which is immutable attribution.
- Relationships are implemented through shared attribute keys that store parent entity keys as values.
- The deployed demo must run on Arkiv Braga testnet.

## Major Components

### Frontend App

Responsibilities:

- Connect a user's wallet.
- Show the current ownership/account state.
- Provide forms for creating memory profiles and memory records.
- Query Arkiv for the user's records using both `PROJECT_ATTRIBUTE` and the connected wallet's owner identity.
- Display empty, loading, success, and error states.
- Trigger Arkiv create, read, query, update, and delete operations.

Boundary:

- The frontend must not persist durable app records outside Arkiv.
- Browser storage may be used only for ephemeral UI preferences or non-sensitive session convenience.

### Arkiv Client Layer

Responsibilities:

- Centralize Arkiv Braga testnet configuration.
- Export the project attribute constants.
- Wrap Arkiv SDK/API calls for entity create, read, query, update, and delete.
- Enforce `PROJECT_ATTRIBUTE` on every entity and every query.
- Normalize Arkiv errors into UI-safe messages.

Assumption: This layer will live in a `src/lib/arkiv` or equivalent module once a stack is selected.

### Entity Schema Layer

Responsibilities:

- Define payload and attribute shapes for all Arkiv entity types.
- Validate user input before creating or updating entities.
- Keep schema versioning explicit.
- Keep relationship attribute names stable.

Required entity types:

1. `memory_profile`
2. `memory_record`

Optional future entity types:

- `query_session`
- `memory_collection`
- `import_batch`

### UI Workflow Layer

Responsibilities:

- Compose Arkiv client operations into user workflows.
- Prevent invalid submits.
- Make ownership, persistence, and failure states clear.
- Avoid marketing-only screens; the first screen should be the usable app once implementation begins.

### Test And Eval Layer

Responsibilities:

- Unit-test schema validation and Arkiv query builders.
- Integration-test Arkiv client behavior with mocks or a safe test harness.
- Smoke-test the deployed or local app workflow.
- Run deterministic project evals through `./scripts/eval.sh`.

## Entity Model

### `memory_profile`

Purpose: A user-owned container for an agent's memory set.

Payload content type: `application/json`

Suggested payload fields:

- `schemaVersion`
- `displayName`
- `agentPurpose`
- `notes`
- `createdAt`
- `updatedAt`

Required attributes:

- `project = arkiv-database-owned-memory-v1`
- `entityType = memory_profile`
- `ownerAddress = connected wallet address`
- `schemaVersion`
- `createdAt`
- `updatedAt`

Metadata:

- `$owner`: connected wallet that may update/delete the profile
- `$creator`: original creator wallet

### `memory_record`

Purpose: A user-owned memory item linked to a `memory_profile`.

Payload content type: `application/json`

Suggested payload fields:

- `schemaVersion`
- `profileEntityKey`
- `title`
- `body`
- `source`
- `tags`
- `importance`
- `createdAt`
- `updatedAt`

Required attributes:

- `project = arkiv-database-owned-memory-v1`
- `entityType = memory_record`
- `profileEntityKey`
- `ownerAddress = connected wallet address`
- `tag_<encoded normalized tag> = one normalized lowercase tag value`
- `createdAt`
- `updatedAt`

Tag contract:

- Payload stores `tags` as an array of displayable strings.
- Attributes store one unique `tag_<hex>` entry per normalized lowercase tag so Arkiv can query by tag without duplicate annotation keys.
- Earlier design notes used repeated `tag` attribute keys; live Braga validation rejects duplicate annotation keys, so the supported equivalent is unique encoded tag keys with the normalized tag retained as the value.

Relationship:

- `memory_record.profileEntityKey` stores the parent `memory_profile` entity key.
- Queries for records belonging to a profile must filter by `project`, `ownerAddress`, and `profileEntityKey`.

Assumption: If privacy is implemented in the first product slice, sensitive `body` content should be encrypted client-side before being written to Arkiv. If encryption is not implemented, the UI must show an inline warning before memory submission that Braga testnet data may be public and only non-sensitive demo content should be entered.

## Data Flow

### Create Profile

1. User connects wallet.
2. UI validates profile form.
3. Arkiv client builds a `memory_profile` entity.
4. Client adds `PROJECT_ATTRIBUTE`, entity type, owner, schema, and timestamps as typed attributes.
5. Entity is submitted to Arkiv Braga.
6. UI reads the created entity key and refreshes profile queries.

### Create Memory Record

1. User selects or creates a profile.
2. UI validates memory fields.
3. Arkiv client builds a `memory_record` entity linked by `profileEntityKey`.
4. Client adds `PROJECT_ATTRIBUTE`, entity type, relationship key, tags, owner, schema, and timestamps as attributes.
5. Entity is submitted to Arkiv Braga.
6. UI refreshes the profile-specific record query.

### Query Records

1. UI builds query filters from user-selected profile, tags, or search controls.
2. Arkiv client injects `project = arkiv-database-owned-memory-v1` into every query.
3. Arkiv client injects the connected wallet owner scope for personal views.
4. Arkiv returns matching entities.
5. UI renders decoded payloads and metadata.

### Update Or Delete

1. User initiates update/delete from an entity they own.
2. UI confirms destructive actions.
3. Arkiv client submits update/delete using current wallet authority.
4. UI handles authorization failures if `$owner` does not match.

## Frontend/Backend Boundary

Assumption: This app should not require a custom backend for the first demo. The browser frontend should talk directly to Arkiv Braga through an SDK/API and wallet provider.

If a backend is later introduced, it must not become the durable source of app data. It may only provide build-time config, optional indexing, or non-authoritative helper services with human approval.

## Storage

Authoritative storage:

- Arkiv Braga testnet entities.

Allowed local/transient storage:

- In-memory UI state.
- Wallet connection session state.
- Non-sensitive local preferences.

Not allowed without approval:

- A separate database for authoritative app records.
- Storing private keys or seed phrases.
- Sending sensitive memory payloads to third-party services without explicit user action.

## External Services

Required:

- Arkiv Braga testnet.
- Wallet provider compatible with Arkiv ownership requirements.

Likely needed:

- Public deployment host for the working demo link.
- GitHub public repository.

Optional:

- LLM provider for memory summarization or import. This must be user-triggered and must not be required for the base CRUD/query demo.

## Authentication And Authorization

Assumption: Wallet connection is the primary auth mechanism. Arkiv `$owner` controls update and delete authority. `$creator` provides tamper-proof attribution.

Authorization rules:

- Users may read public/testnet data returned by allowed queries.
- Personal views must default to connected-wallet records only.
- Users may update/delete only entities for which their wallet is `$owner`.
- UI must show authorization failures clearly.
- Queries must always include `PROJECT_ATTRIBUTE` to avoid cross-project data leakage.

## Deployment Assumptions

- The challenge demo must be deployed against Arkiv Braga testnet.
- The frontend should be deployable as a static web app unless the selected Arkiv SDK requires server-side support.
- Production credentials must not be required for local setup.
- README setup instructions are required before submission.

## Architectural Non-Goals

- No custom blockchain or smart contract implementation.
- No private production database as source of truth.
- No custodial wallet or key management.
- No paid LLM dependency for the minimum demo.
- No multi-tenant admin console in the first vertical slice.
- No broad indexing of unrelated Arkiv data.
