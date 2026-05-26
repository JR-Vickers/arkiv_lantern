# Arkiv Lantern

Arkiv Lantern is a web app for wallet-owned memory on Arkiv. You create memory profiles and memory records as Arkiv entities controlled by your wallet.

## What You Can Do

- Connect MetaMask and use Arkiv Braga testnet
- Create and manage `memory_profile` entities
- Create and manage `memory_record` entities linked to a profile
- Query your records by profile and tag
- Store memory body as plaintext or encrypted text (your choice per record)

## Stack

- TypeScript
- React + Vite
- Vitest
- ESLint
- Arkiv SDK: `@arkiv-network/sdk`

## Setup

Use Node.js 22 or another current LTS-compatible Node runtime.

```bash
npm install
```

Validate local tooling:

```bash
./scripts/setup.sh --check
```

## Run Locally

```bash
npm run dev
```

The app is served by Vite at a local URL (commonly `http://127.0.0.1:5173/`).

## MetaMask And Arkiv Braga

When you connect MetaMask, the app requests the Arkiv Braga network if needed.

- Network: Arkiv Braga testnet
- Chain ID: `60138453102`
- Currency symbol: `GLM`
- RPC URL: `https://braga.hoodi.arkiv.network/rpc`
- Explorer: `https://explorer.braga.hoodi.arkiv.network`

You need a MetaMask account with Braga testnet funds to submit write transactions.

## Full Deployment Path

This app defaults to Arkiv Braga testnet.  For a full deployment beyond Braga, have your agent:

1. Point Arkiv client configuration to your target Arkiv network (chain ID, RPC, explorer, and SDK network config).
2. Update wallet-network prompts so MetaMask requests the target network instead of Braga.
3. Run the full local gate (`./scripts/check.sh`) plus live write/read verification on that network.
4. Deploy the built app (`npm run build`) to your host and validate end-to-end wallet + Arkiv flows.

If you do this, treat all plaintext memory bodies as public unless you keep encryption enabled for sensitive content.

## Privacy Model: Plaintext vs Encrypted Memory Body

`memory_record` supports two body modes:

- Plaintext body: written as plaintext JSON to public Braga testnet
- Encrypted body: encrypted in-browser before write

Encryption details:

- Body encryption uses passphrase-derived AES-GCM (PBKDF2 + random salt/IV)
- Only the memory body is encrypted
- Title, tags, source, importance, and profile linkage stay plaintext for querying

Important behavior:

- Passphrases are not recoverable by the app
- If you lose a passphrase, that encrypted body cannot be decrypted
- The app does not persist passphrases or encryption keys in durable browser storage

## Using The App

1. Connect MetaMask.
2. Create a memory profile.
3. Create memory records under that profile.
4. Optionally encrypt record bodies with your own passphrase.
5. Filter/query records by profile and tag.
6. Inspect, update, or delete records you own.

## Testnet Transaction Notes

Braga is a public testnet and can be slow.

- Pending transaction status in MetaMask/explorer usually means testnet latency, not immediate app failure.
- Use transaction hashes to track final status in the explorer.

## Quality Checks

Run the full local gate:

```bash
./scripts/check.sh
```

Before claiming final challenge submission readiness, run:

```bash
SUBMISSION_READY=true ./scripts/check.sh
```

Run individual checks:

```bash
./scripts/lint.sh
./scripts/typecheck.sh
./scripts/test.sh
./scripts/smoke.sh
./scripts/eval.sh
```

## Build And Deployment

Build static output:

```bash
npm run build
```

For GitHub Pages project sites:

```bash
VITE_BASE_PATH=/REPOSITORY_NAME/ npm run build
```

For root Pages sites (for example `OWNER.github.io`):

```bash
VITE_BASE_PATH=/ npm run build
```

This repo includes `.github/workflows/deploy-pages.yml` for GitHub Pages deployment via GitHub Actions.

## License

MIT. See `LICENSE`.
