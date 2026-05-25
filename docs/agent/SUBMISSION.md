# Submission Metadata

This file is the deterministic source for challenge-submission readiness checks. Replace every "Requires human" value before claiming AC-016 or running `SUBMISSION_READY=true ./scripts/check.sh`.

## Challenge

- Submission form: https://forms.arkiv.network/ethns-arkiv-challenge
- Target network: Arkiv Braga testnet
- Theme: AI
- Project name: Arkiv Lantern
- Project summary: User-owned AI agent memory on Arkiv Braga with wallet-owned profiles and records, optional encrypted memory bodies, and plaintext searchable metadata for queryable demo workflows.

## Repository

- Public GitHub repo: https://github.com/JR-Vickers/arkiv_lantern
- License: MIT
- README setup instructions complete: Yes for Phase 7 readiness
- Local Git remote discovered: No, this workspace is not a Git repository
- Deployment workflow: `.github/workflows/deploy-pages.yml`

## Demo

- Working demo link: Requires human after GitHub Pages is enabled and deployed
- Demo video link: Requires human before prize claim
- Braga test wallet public address: `0x5056A091A9674EB1bDFcE49a689b175Bd69E81A2`
- Demo shows create/query/update/delete for `memory_profile`: Requires human manual Braga verification on deployed URL
- Demo shows create/query/update/delete for plaintext `memory_record`: Requires human manual Braga verification on deployed URL
- Demo shows create/query/update/delete for encrypted `memory_record`: Requires human manual Braga verification on deployed URL
- Demo shows `PROJECT_ATTRIBUTE`: Yes in app shell and query detail UI
- Live Braga pending-transaction caveat documented: Yes

## Team

- Team members: Requires human
- GitHub handles: Requires human
- Wallet address for prize distribution: Requires human

## Demo Video Checklist

- Show the deployed URL and connected MetaMask account on Arkiv Braga.
- Show `project = arkiv-database-owned-memory-v1` in the app shell or query detail.
- Create a `memory_profile` and inspect its payload and owner metadata.
- Create a plaintext `memory_record` with non-sensitive demo content and the public-testnet acknowledgement.
- Query records by profile and tag.
- Create an encrypted `memory_record`, inspect the locked payload, decrypt it with the demo passphrase, and mention key-loss behavior.
- Update and delete an owned profile or record, or show the owner-controlled controls if Braga transactions are pending.
- Mention that long pending Braga transactions are testnet lag unless diagnostics show an app encoding failure.

## Submission Status

- Submitted: Not submitted
- Submitted by: Requires human
- Submission date: Requires human
- Submission URL/status: Requires human
- Notes: GitHub Pages support is present, but public repository publication, Pages activation, deployed URL, final team info, prize wallet, and optional/prize demo video link require human completion.
