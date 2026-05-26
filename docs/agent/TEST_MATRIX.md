# Test Matrix

Historical bootstrap note: the implementation now uses TypeScript + Vite + React with npm.

- Unit/integration: Vitest
- React component tests: React Testing Library
- Static checks: ESLint and TypeScript `tsc --noEmit`

Do not install these during bootstrap unless the human explicitly moves the project into implementation mode.

## Required Test Coverage

| Test Area | Cases | Acceptance Criteria | Suggested Level |
| --- | --- | --- | --- |
| Project attribute guardrail | Entity builders include `PROJECT_ATTRIBUTE`; query builders inject it; missing attribute throws or is impossible by type. | AC-001 | Unit |
| Arkiv Braga config | Config targets Braga; missing config fails loudly; no production credentials required. | AC-002, AC-014 | Unit/integration |
| Entity schema validation | Valid profile; invalid missing display name; valid memory; invalid missing profile; invalid tag formats; boundary body length; both required entity types set payload, attributes, content type, and `expiresIn`. | AC-003, AC-006, AC-007, AC-015 | Unit |
| Relationship modeling | `memory_record` stores `profileEntityKey`; profile-specific query uses `project`, owner scope, `entityType`, and `profileEntityKey`. | AC-004, AC-008 | Unit/integration |
| Tag indexing | Payload stores `tags`; each normalized lowercase tag is indexed as a unique encoded tag attribute; tag queries use attributes rather than payload-only filtering. | AC-008, AC-015 | Unit/integration |
| Wallet state | Disconnected state; connected state; wallet switch; rejected connection. | AC-005, AC-011 | Component/smoke |
| Loading states | Profile query loading state; memory query loading state; create/update/delete pending state does not blank the app. | AC-011 | Component/smoke |
| Profile workflow | No profiles empty state; create profile; owner-scoped query profile; reload and query again; create failure. | AC-006, AC-011, AC-012 | Integration/smoke |
| Memory workflow | Empty profile; create memory; owner-scoped query by profile; query by tag; read detail; create failure. | AC-007, AC-008, AC-009, AC-011 | Integration/smoke |
| Update/delete workflow | Owner update; owner delete; delete confirmation; unauthorized update/delete; network failure. | AC-010, AC-011, AC-014 | Integration/smoke |
| Persistence | Create entity, reload app, query from Arkiv, confirm local storage is not source of truth. | AC-012 | Smoke/e2e |
| README and deliverables | README commands work; demo link configured; submission info section exists. | AC-013, AC-016 | Eval/manual |
| Security and secrets | No committed private keys; no seed phrases; no required paid API key; no unsafe destructive scripts; memory body flow either encrypts payloads or shows public-testnet warning before submit. | AC-014 | Eval/review |
| Regression | Every fixed P0/P1 bug gets a focused regression test. | AC-015, AC-017 | Unit/integration/e2e |

## Happy Path Tests

- Connect wallet.
- Create `memory_profile`.
- Create `memory_record` linked to the profile.
- Query current wallet records by profile.
- Query current wallet records by tag.
- Open record detail and inspect payload/metadata.
- Reload and query persisted data.

## Invalid Input Tests

- Submit profile with missing display name.
- Submit memory with missing title.
- Submit memory without selecting a profile.
- Submit invalid tag values.
- Submit body at and beyond the accepted size boundary.
- Submit memory body without acknowledging public-testnet warning when encryption is not implemented.

## Missing Data Tests

- No wallet connected.
- No profiles returned.
- Profile has no memories.
- Memory references missing/deleted profile.
- Arkiv query returns older schema version.

## Auth/Security Tests

- Write operation requires connected wallet.
- Update/delete succeeds for `$owner`.
- Update/delete fails for non-owner.
- Queries always include `PROJECT_ATTRIBUTE`.
- Personal queries include owner scope.
- Memory body submission includes encryption or public-testnet warning.
- No secrets are present in source/config.

## Failure State Tests

- Arkiv network unavailable.
- Entity creation rejected.
- Query fails.
- Wallet connection rejected.
- Deployment smoke target unavailable.

## Current Implementation Expectation

`scripts/test.sh` must run the real Vitest suite. It must not return success merely because no tests are configured.
