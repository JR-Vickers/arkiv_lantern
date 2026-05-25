# Arkiv Lantern

```text
                        .     .       .  .   . .   .   . .    +  .
                  .     .  :     .    .. :. .___---------___.  .
                       .  .   .    .  :.:. _".^ .^ ^.  '.. :"-_. .
                    .  :       .  .  .:../:            . .^  :.:\.
                        .   . :: +. :.:/: .   .    .        . . .:\
                 .  :    .     . _ :::/:               .  ^ .  . .:\
                  .. . .   . - : :.:./.                        .  .:\
                  .      .     . :..|:                    .  .  ^. .:|
                    .       . : : ..||        ARKIV LANTERN         :|
                  .     . . . ::. ::\(         user-owned          .:/
                 .   .     : . : .:.|.\       web3 memory vault    :/
                  +   .   .   : . ::.\/_                     .   .:/
                   .         +   .  .:.\.            .         .:/
                     .      . . .   . ::/  .      .            :/
                        .      .      .:/______________________/ 

                                                .-.
                                                (   )
                                                `-'
                                                /|\
                                                / | \
                                              /  |  \
                                              '---^---'

                                onchain records + local-key encryption
```

Arkiv Lantern is an AI-themed Arkiv Braga testnet app for user-owned agent memory. Users create memory profiles and memory records as Arkiv entities controlled by their wallet, not by a platform database.

Current implementation status: Phase 7 challenge-readiness support. The app shell, developer tooling, Arkiv contract guardrails, `memory_profile` create/read/query/update/delete workflow, `memory_record` create/read/query/update/delete workflow, write diagnostics, opt-in encrypted memory body workflow, static build support, and GitHub Pages workflow are in place.

## Stack

- TypeScript
- Vite
- React
- npm
- Vitest
- ESLint
- Arkiv SDK: `@arkiv-network/sdk`

## Setup

Use Node.js 22 or another current LTS-compatible Node runtime with npm.

```bash
npm install
```

Validate the local toolchain without requiring production credentials:

```bash
./scripts/setup.sh --check
```

No private keys, seed phrases, wallet secrets, deployment tokens, paid API keys, or `.env` files are required for setup.

## Run Locally

```bash
npm run dev
```

Vite serves the usable app shell at `http://127.0.0.1:5173/` by default. If that port is busy, Vite will print the actual local URL.

Use a browser profile with MetaMask for live Braga writes. The app requests the Arkiv Braga chain, creates and mutates `memory_profile` and `memory_record` entities through MetaMask, and queries profiles and records by the connected owner address.

## MetaMask And Braga

Arkiv Lantern uses the Braga chain definition from `@arkiv-network/sdk` and asks MetaMask to add or refresh the network when the wallet connects.

- Network: Arkiv Braga testnet
- Chain ID: `60138453102`
- Currency symbol: `GLM`
- RPC URL: `https://braga.hoodi.arkiv.network/rpc`
- Explorer: `https://explorer.braga.hoodi.arkiv.network`
- Funded public test wallet documented for manual planning: `0x5056A091A9674EB1bDFcE49a689b175Bd69E81A2`

The public address above is not a credential. Manual create/update/delete testing still requires a MetaMask account with Braga testnet funds and user-approved signatures.

## Checks

Run the full project gate before claiming completion:

```bash
./scripts/check.sh
```

Individual checks:

```bash
./scripts/lint.sh
./scripts/typecheck.sh
./scripts/test.sh
./scripts/smoke.sh
./scripts/eval.sh
```

The smoke script builds the static Vite output and verifies the generated `dist/index.html` has the React root and bundled assets. Final submission readiness is stricter:

```bash
SUBMISSION_READY=true ./scripts/check.sh
```

That final command is expected to fail until human-owned submission values in `docs/agent/SUBMISSION.md` are replaced with real public URLs, team info, and prize wallet metadata.

## Arkiv Contract Decisions

- Theme: AI
- Network: Arkiv Braga testnet
- Project attribute: `project = arkiv-database-owned-memory-v1`
- Entity types: `memory_profile`, `memory_record`
- Entity expiry: 365 days
- Content type: `application/json`
- Ownership scope: personal views filter by owner address and Arkiv `$owner`
- Relationship: `memory_record` entities store the parent `memory_profile` key in indexed `profileEntityKey`
- Tag indexing: JSON payload stores `tags`; Arkiv attributes store normalized lowercase `tag` values
- Privacy: plaintext memory records remain supported; encrypted memory records encrypt only the body
- Encrypted metadata: title, tags, source, and importance remain plaintext searchable metadata

## Plaintext And Encrypted Memories

Plaintext records are for non-sensitive demo data. The UI warns before plaintext create/update that memory bodies are written as plaintext JSON on Braga testnet and may be public.

Encrypted records are opt-in per memory record. When enabled, the browser derives an AES-GCM key from a user-entered passphrase with PBKDF2 and random salt/IV, encrypts the body before writing to Arkiv, and stores only encrypted body metadata plus ciphertext in the Arkiv JSON payload.

Only the memory body is encrypted. Title, tags, source, importance, profile relationship, owner scope, schema, timestamps, and required Arkiv attributes remain plaintext so the app can query and display records.

Passphrases are not recoverable by the app. If a user loses the passphrase for an encrypted memory body, Arkiv Lantern cannot decrypt that body.

The app does not persist passphrases, derived keys, encryption keys, seed phrases, wallet secrets, or decrypted bodies in local storage, session storage, IndexedDB, cookies, files, or a backend database. Decrypted bodies are held only in React state for the active view and can be cleared from the detail panel.

## Live Braga Notes

Braga is a public testnet. Transactions may stay pending for an extended time when the chain or RPC is lagging. A pending transaction shown by MetaMask or the explorer is not by itself an app encoding failure.

For live demo testing:

1. Connect MetaMask and confirm the Braga network details.
2. Create a memory profile.
3. Create a plaintext memory record with non-sensitive demo content and the public-testnet acknowledgement checked.
4. Create an encrypted memory record with a temporary passphrase, then inspect and decrypt it in the detail panel.
5. Update and delete records only when MetaMask shows the connected wallet as the Arkiv `$owner`.
6. If a write fails before submission with a Brotli/decompression error, run the in-app write diagnostics and refresh the MetaMask Braga RPC entry.

## Deployment

The app builds to static Vite output in `dist/`:

```bash
npm run build
```

For a GitHub Pages project site, build with a repository base path:

```bash
VITE_BASE_PATH=/REPOSITORY_NAME/ npm run build
```

For a user or organization Pages root site such as `OWNER.github.io`, use the root base path:

```bash
VITE_BASE_PATH=/ npm run build
```

This repo includes `.github/workflows/deploy-pages.yml`, which uses GitHub Actions, `npm ci`, `npm run build`, and the official Pages artifact/deploy actions. It does not require deployment secrets. To activate it after publishing the repository:

1. Push the repository to GitHub on the `main` branch.
2. In GitHub, open Settings -> Pages.
3. Set Build and deployment source to GitHub Actions.
4. Run the `Deploy GitHub Pages` workflow or push to `main`.
5. Copy the resulting Pages URL into `docs/agent/SUBMISSION.md`.

Public deployment cannot be completed from this local workspace because no Git remote or GitHub account settings are available here.

## Submission

Challenge readiness metadata lives in `docs/agent/SUBMISSION.md`. Replace every `Requires human` placeholder before final submission with the public repository URL, working demo URL, team info, prize wallet address, submission status, and demo video metadata.

Submit at `https://forms.arkiv.network/ethns-arkiv-challenge` after `./scripts/check.sh` passes and the deployed demo has been manually exercised against Braga.
