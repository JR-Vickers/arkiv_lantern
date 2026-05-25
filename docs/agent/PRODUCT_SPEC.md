# Product Spec

## Product Summary

Assumption: Build "Arkiv Database: Owned Agent Memory," a web3-native app where users create and query AI memory records they own. All durable data is stored on Arkiv Braga testnet as entities with a unique project attribute.

Assumption: Primary theme is AI.

Privacy must be treated as optional scope. Do not claim the Privacy theme unless client-side encryption for sensitive memory payloads is implemented and tested. Phase 6 implements opt-in client-side encryption for memory record bodies while preserving plaintext demo records. Encrypted records keep title, tags, source, and importance as plaintext searchable metadata; the body must not be written to Arkiv attributes or payload plaintext.

## Users

### Demo User

A hackathon judge or tester who wants to verify that the app stores and queries user-owned data on Arkiv.

### Data Owner

A person who wants an agent memory store that is controlled by their wallet rather than by a platform account.

### Future Agent Developer

A developer who wants to read user-approved memories from Arkiv and use them with an AI agent.

## User Stories

- As a user, I can connect my wallet so that Arkiv records are associated with my ownership identity.
- As a user, I can create a memory profile for an agent or use case.
- As a user, I can create memory records under a profile.
- As a user, I can query my memory records by profile and tag.
- As a user, I can open an individual memory record and inspect its payload and Arkiv metadata.
- As a user, I can update or delete records I own.
- As a user, I can see clear empty and error states when Arkiv returns no data or an operation fails.
- As a judge, I can verify that entities and queries use the unique project attribute.
- As a developer, I can run setup, checks, tests, smoke checks, and evals through documented scripts.

## Primary Workflows

### First Run

1. User opens the deployed app.
2. App shows wallet connection and useful empty state.
3. User connects wallet.
4. App queries Arkiv for `memory_profile` entities using `PROJECT_ATTRIBUTE` and the connected wallet owner identity.
5. If none exist, app prompts the user to create the first profile.

### Create Profile

Inputs:

- Display name
- Agent purpose
- Optional notes

Outputs:

- A `memory_profile` Arkiv entity.
- UI state showing the new profile.

Required behavior:

- Validate required fields.
- Add `PROJECT_ATTRIBUTE`.
- Set entity type attribute to `memory_profile`.
- Store payload as JSON.
- Use connected wallet ownership.
- Set `ownerAddress` to the connected wallet address.

### Create Memory Record

Inputs:

- Profile
- Title
- Body
- Tags
- Source
- Importance

Outputs:

- A `memory_record` Arkiv entity linked to the selected profile.
- Updated profile record list.

Required behavior:

- Validate required fields.
- Add `PROJECT_ATTRIBUTE`.
- Set entity type attribute to `memory_record`.
- Add `profileEntityKey` relationship attribute.
- Add `ownerAddress` and one normalized lowercase `tag` attribute per tag.
- If memory bodies are not encrypted, show an inline public-testnet warning before submit.
- If encryption is enabled, require an explicit user-entered passphrase, encrypt the memory body in the browser before writing to Arkiv, and do not persist the passphrase, derived key, or plaintext body outside ephemeral UI state.
- Encrypted records may keep title, tags, source, and importance as plaintext searchable metadata, but must not leak body plaintext into Arkiv attributes.
- Persist to Arkiv Braga.

### Query Memories

Inputs:

- Profile filter
- Tag filter
- Optional text search if supported by chosen Arkiv query capabilities

Outputs:

- List of matching memory records.
- Empty state if no records match.

Required behavior:

- Every query includes `PROJECT_ATTRIBUTE`.
- Profile queries include `entityType = memory_profile`.
- Memory record queries include `entityType = memory_record`.
- Personal views include `ownerAddress` or Arkiv `$owner` filtering for the connected wallet.
- Profile-specific record queries include `profileEntityKey`.
- Tag filters use normalized lowercase `tag` attributes, not payload-only filtering.

### Update Or Delete

Inputs:

- Selected entity
- Updated form fields or delete confirmation

Outputs:

- Updated or removed Arkiv entity.
- UI refresh.

Required behavior:

- Only owners can update/delete.
- Authorization failures are shown without losing local form data.
- Delete requires confirmation.

Assumption: Update and delete are required for both `memory_profile` and `memory_record` unless the human explicitly narrows the first demo scope.

## Inputs

- Wallet connection/account state.
- User-entered profile fields.
- User-entered memory fields.
- Query filters.
- Arkiv Braga network responses.

## Outputs

- Arkiv entities on Braga testnet.
- Query results rendered in the UI.
- Entity detail view including payload and relevant metadata.
- User-facing errors for validation, network, and authorization failures.
- README and demo link for challenge submission.

## Empty States

- No wallet connected: show connect control and no private assumptions about the user.
- No profiles: offer profile creation.
- Profile has no memories: offer memory creation for that profile.
- Query has no matches: show no-result state and preserve filters.

## Error States

- Wallet connection rejected: keep the user on the current screen, show the rejection, and allow retry.
- Arkiv network unavailable: preserve form inputs and show a retry path.
- Braga faucet/testnet funding unavailable: explain the missing testnet prerequisite without requesting production credentials.
- Entity create/update/delete fails: preserve user-entered data, show the operation that failed, and allow retry.
- Query fails: keep existing visible data if present, show a query error, and allow retry.
- User is not `$owner` for update/delete: block the operation and keep the entity read-only.
- Payload validation fails: identify the invalid field before submit.
- Required environment/config value missing: fail loudly in setup/check output and show a developer-oriented app error if reached in UI.

## Edge Cases

- User switches wallet after data is loaded.
- Arkiv query returns entities from older schema versions.
- Record references a missing or deleted profile.
- Duplicate titles or tags.
- Large memory body near Arkiv payload limits.
- Special characters in tags and text fields.
- Expired entities if `expiresIn` is configured too short.
- Public testnet data is visible to other users.
- Personal query views must not accidentally show other users' records.

## Non-Goals

- Full production privacy guarantees before encryption design is confirmed.
- Custom backend database.
- Custodial wallets.
- Paid LLM workflow as a required path.
- Cross-chain support.
- Mobile-native app.

## Questions For Human

See `QUESTIONS.md` for the full question list. Blocking questions must be answered or explicitly accepted as assumptions before implementation begins.
