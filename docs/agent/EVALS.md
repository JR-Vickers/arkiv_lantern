# Evals

Project evals are acceptance gates specific to this Arkiv challenge project. Prefer deterministic checks over subjective judging.

Future agents should iterate on the lowest failing eval section first, because early failures often make later results meaningless.

## Deterministic Checks

`./scripts/eval.sh` should verify:

1. Required docs are present and non-empty.
2. Shell scripts have the required bash header and are executable.
3. `README.md` exists and contains setup/run/test instructions before submission.
4. `README.md` contains Phase 7 guidance for MetaMask/Braga setup, plaintext and encrypted memory behavior, key-loss risk, live Braga pending transactions, GitHub Pages deployment, and final submission checks.
5. `SUBMISSION.md` exists during Phase 1. Before AC-016 is claimed, `SUBMISSION_READY=true ./scripts/eval.sh` must verify non-placeholder challenge deliverables: theme, public GitHub repo, working demo link, team info, wallet address, and submission URL/status.
6. Static deployment support exists through Vite base-path configuration and a credential-free GitHub Pages workflow.
7. The implementation exposes executable Arkiv contract checks for project attribute, owner scoping, required entity types, content type, `expiresIn`, Braga config, and tag indexing.
8. The implementation contains both required entity types: `memory_profile` and `memory_record`.
9. Arkiv-related implementation code references Braga testnet configuration.
10. Source/config/scripts do not contain obvious committed secrets, unsafe `.env` files, paid-service dependencies, mainnet config, or destructive script patterns.
11. `./scripts/check.sh` remains the main acceptance gate.

## Subjective Or LLM-Judge Checks

Use these only after deterministic checks pass:

- The app clearly communicates user-owned data.
- The demo is understandable to a challenge judge without private context.
- UI copy is specific to the product and not raw AI placeholder text.
- Privacy claims match the implemented behavior.
- The architecture remains simple enough for a challenge demo.

Subjective checks should produce findings, not silently block scripts, unless converted into deterministic rules.

## Thresholds

- Deterministic evals: 100 percent pass required for completion.
- P0 review findings: 0 allowed.
- P1 review findings: 0 unresolved unless explicitly accepted by the human.
- P2 review findings: may remain if documented and not user-facing.
- Smoke workflow: must pass at least one create/query path for each required entity type before submission.
- Final submission readiness: run `SUBMISSION_READY=true ./scripts/check.sh`; unresolved `SUBMISSION.md` placeholders are warnings before Phase 7 and failures for final submission.

## Eval Failure Order

When evals fail, fix in this order:

1. Missing tooling or scripts.
2. Missing project attribute guardrails.
3. Missing required entity type.
4. Broken create/read/query behavior.
5. Security or secret-handling issues.
6. README and submission deliverables.
7. Subjective polish.

## Current Implementation Expectation

The eval script now checks the implemented source, README, scripts, GitHub Pages deployment support, Arkiv contract guardrails, Braga configuration, required entity types, and secret/destructive-command rules. A passing eval must represent real implementation checks, not placeholder success.
