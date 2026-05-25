# Security Rules

Be conservative. This project handles user-owned data on a public/testnet web3 data layer, so security claims must be precise and implemented behavior must be easy to verify.

## Permissions

- Local setup scripts must not require production credentials.
- Scripts must not perform destructive file, chain, or Arkiv operations.
- Wallet actions must be initiated by the user.
- Automated tests must use mocks, safe test accounts, or explicit testnet-only flows.

## Secrets Handling

Never commit:

- Private keys
- Seed phrases
- Wallet files
- Production API keys
- Paid LLM provider keys
- Deployment tokens
- `.env` files containing secrets

Allowed:

- Public testnet RPC URLs.
- Public app identifiers.
- Example environment files with placeholder values.

Required:

- Use environment variables for secrets if a future integration needs them.
- Document every required environment variable in README.
- Keep `.env.local` or equivalent files ignored once a stack is configured.

## External API Rules

- Arkiv Braga testnet is the required external data layer.
- Optional LLM or enrichment services must not receive user memory payloads unless the user explicitly triggers that action.
- Paid APIs require human approval before use.
- Do not add analytics, telemetry, or tracking services without human approval.

## Paid Resource Restrictions

Requires human approval:

- Paid LLM calls
- Paid hosted databases
- Paid deployment changes
- Paid monitoring or analytics
- Mainnet transactions
- Testnet actions that require scarce/funded resources outside the approved demo wallet flow

## Destructive Action Restrictions

Requires human approval:

- Bulk delete/update of Arkiv entities.
- Resetting or deleting local project files.
- Force-pushing or rewriting repository history.
- Deleting tests, evals, or acceptance criteria.
- Running scripts that modify data outside the current repository.

## Dependency Rules

- Prefer established dependencies with clear maintenance and licensing.
- Do not add dependencies for trivial utilities.
- Do not install packages during bootstrap unless implementation mode is explicitly requested.
- Review new dependencies for install scripts, wallet/key handling, and network behavior.
- Pin or lock dependency versions according to the selected package manager.

## Data Handling Constraints

- Authoritative app data must live on Arkiv.
- Every entity and query must include `PROJECT_ATTRIBUTE`.
- Public testnet data should be treated as public unless client-side encryption is implemented.
- Do not ask users to enter real secrets or sensitive personal data into the demo.
- Memory body submission must either encrypt payloads client-side or show an inline warning that Braga testnet data may be public and only non-sensitive demo content should be entered.
- If encryption is implemented, test encryption/decryption and document key-loss behavior.
- Phase 6 encryption uses an explicit passphrase for memory record bodies only. Title, tags, source, and importance remain plaintext searchable metadata; body plaintext must not be indexed or stored durably outside Arkiv encrypted payloads.

## Requires Human Approval

- Changing the product theme or core app concept.
- Introducing a backend database.
- Sending user memory payloads to an LLM or third-party service.
- Adding paid services.
- Committing or handling real credentials.
- Weakening security-related acceptance criteria.
- Performing destructive actions.
- Deploying to a public URL under a paid or production account.
