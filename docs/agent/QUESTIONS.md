# Questions

`DESCRIPTION.md` is challenge-level rather than product-level. These questions capture missing decisions. Blocking questions should be answered before implementation unless the human explicitly accepts the bootstrap assumptions.

## Product Behavior

### Blocking Before Implementation

- Should the project use the bootstrap concept: an Arkiv-backed user-owned AI memory/data vault? Answer: Yes, let's do the AI memory/data vault.
- What exact user workflow should the demo optimize for: creating memories manually, importing data, querying memories, or showing ownership transfer/update/delete?

### Useful But Not Blocking

- Should the default AI theme be changed to Privacy, DePIN, or an explicit hybrid?  No, let's stick with AI.
- Should update/delete scope be narrowed from the current assumption that both profiles and records support it?
- Should memory records support free-text search, tag-only filtering, or both?  Both.
- What should the demo seed/example data look like?

### Optional Clarification

- What product name should appear in the UI and README?  Make something up.
- Should demo copy mention agents, personal data vaults, or both?  Both.

## Technical Stack

### Blocking Before Implementation

- Confirm the frontend framework and package manager. Recommended assumption: TypeScript + Vite + React with npm unless another stack is preferred.  Agreed.
- Which Arkiv SDK/API package and docs should the implementation use?  You should be able to find everything you need at these two URLS:
https://docs.arkiv.network/
https://docs.arkiv.network/start-here/installation/
https://docs.arkiv.network/json-rpc/querying-data/
- What `expiresIn` value should entities use for the Braga demo?
Let's go with 365 days.

### Useful But Not Blocking

- Should the app avoid a backend entirely for the first demo?  I thought the testnet was our backend?
- Should the project use Playwright for smoke/e2e tests?  No.

### Optional Clarification

- Is there a preferred deployment host?  Let's try IPFS if possible.  Flag this for human review if it causes problems.

## Data/Storage

### Blocking Before Implementation

- Confirm `PROJECT_ATTRIBUTE_VALUE`: `arkiv-database-owned-memory-v1`.  Confirmed
- Confirm required entity types: `memory_profile` and `memory_record`.  Confirmed
- Should memory payload bodies be plaintext demo data or encrypted client-side?  Phase 6 update: preserve existing plaintext behavior, but add an explicit opt-in client-side encryption workflow for memory records.
- If plaintext demo data is allowed, confirm that an inline public-testnet warning before memory submission is sufficient.  Yes for plaintext submissions; encrypted submissions must clearly show that a passphrase is required and not recoverable by the app.
- Confirm tag indexing contract: one normalized lowercase tag value per tag, with `tags` retained in the JSON payload. Updated on 2026-05-26 after live Braga rejected duplicate `tag` annotation keys: use unique encoded tag attribute keys instead of repeated `tag` keys.

### Useful But Not Blocking

- What maximum memory body size should the UI allow?  Let's do a 200k context window (or equivalent).
- Should tags be normalized to lowercase?  Yes.
- Should schema migrations be supported in the first version?  Yes.

### Optional Clarification

- Should records support attachments or only JSON/text payloads?  JSON

## Auth/Security

### Blocking Before Implementation

- Which wallet/provider flow is expected for Arkiv Braga?  Metamask
- Are test wallets or faucet-funded accounts available for smoke tests?  Yes. Funded Braga test wallet public address: `0x5056A091A9674EB1bDFcE49a689b175Bd69E81A2`.
- If encryption is required, what key source should be used?  Phase 6 update: use an explicit user-entered passphrase with browser-native crypto. Do not persist the passphrase, derived key, or plaintext durable memory data outside ephemeral React state.
- Should the UI warn users that Braga testnet data may be public?  Yes

### Useful But Not Blocking

- Should delete be hard delete only, or should records support an archived state?

### Optional Clarification

- Should the demo include ownership transfer if Arkiv supports it?  Yes.

## Testing/Evals

### Blocking Before Implementation

- Should smoke tests use a mocked Arkiv client, live Braga testnet, or both?  Live braga testnet.
- What level of live network dependency is acceptable in `./scripts/check.sh`?  Whatever is industry standard.

### Useful But Not Blocking

- Should deployment smoke tests run against a demo URL through `APP_URL`?  Whatever you think is best.
- Are there challenge-specific eval examples from Arkiv that should be added?  No.

### Optional Clarification

- Should a demo video checklist be added to evals before submission?  Yes.

## Deployment

### Blocking Before Implementation

- Where should the public demo be deployed?  Github
- Who owns the GitHub repository and challenge submission metadata?  Me.

### Useful But Not Blocking

- Should deployment be automatic or manual for the hackathon demo?  Automatic
- What license should the open-source repository use?  MIT

### Optional Clarification

- Should the README include a deploy button or only command-line instructions?  CLI

## Design/UX

### Blocking Before Implementation

- Should the first screen be the usable app shell, with no marketing landing page?  Yes.
- Should the UI prioritize desktop judge review, mobile responsiveness, or both equally?  Both.

### Useful But Not Blocking

- Should the UI expose raw Arkiv entity keys and metadata by default?  Yes.
- Should privacy warnings be shown inline near memory body fields?  Yes.

### Optional Clarification

- Is there a preferred visual style or brand direction?  Let's default to the arkiv website style, but don't obsess over it.
