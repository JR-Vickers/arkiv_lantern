# Implementation Plan

Build in vertical slices. Each phase should leave the project closer to a working Arkiv Braga demo and should include tests or executable checks before moving on.

## Phase 0: Confirm Product And Stack

Objective:

- Confirm the bootstrap assumption: an Arkiv-backed user-owned AI memory/data vault.
- Choose the implementation stack and package manager.

Files/areas likely touched:

- `QUESTIONS.md`
- `PROJECT_ARCHITECTURE.md`
- `PRODUCT_SPEC.md`
- `TEST_MATRIX.md`
- `scripts/*.sh`
- New package/config files after confirmation

Dependencies:

- Human decision on product theme and stack.
- Arkiv fundamentals documentation and SDK/API choice.

Tests to add/update:

- None until the stack is created.
- Update script commands once tooling is selected.

Completion criteria:

- Blocking questions in `QUESTIONS.md` are answered or accepted as assumptions.
- Package manager and framework are configured.
- `scripts/setup.sh --check` can validate the selected tooling.

## Phase 1: App Scaffold And Developer Tooling

Objective:

- Create the minimal deployable web app skeleton without Arkiv behavior.
- Wire linting, type checking, unit tests, and smoke-test infrastructure.

Files/areas likely touched:

- Package manager files
- App source directory
- Test config
- Lint/typecheck config
- `scripts/setup.sh`
- `scripts/lint.sh`
- `scripts/typecheck.sh`
- `scripts/test.sh`
- `scripts/smoke.sh`

Dependencies:

- Phase 0 stack decision.

Tests to add/update:

- Smoke test that the app renders.
- Unit test harness sanity test.

Completion criteria:

- Local app starts.
- Lint, typecheck, and unit test scripts run.
- `./scripts/check.sh` reaches implementation-related failures instead of tooling-not-configured failures.

## Phase 2: Arkiv Configuration And Project Attribute Guardrails

Objective:

- Centralize Arkiv Braga config and enforce `PROJECT_ATTRIBUTE` on all entity builders and query builders.

Files/areas likely touched:

- Arkiv client/config module
- Entity schema module
- Environment/config documentation
- Tests for entity/query builders

Dependencies:

- Arkiv SDK/API documentation.
- Braga testnet connection details.

Tests to add/update:

- Unit tests proving each entity builder includes `project = arkiv-database-owned-memory-v1`.
- Unit tests proving query builders cannot omit the project attribute.
- Negative tests for missing config.

Completion criteria:

- No Arkiv create/query helper can be called without the project attribute.
- Tests cover both entity types.
- `scripts/eval.sh` can detect the project attribute in implementation code.

## Phase 3: Memory Profile Vertical Slice

Objective:

- Implement create, read, and query for `memory_profile`.

Files/areas likely touched:

- Profile schema
- Arkiv profile repository/service
- Profile creation UI
- Profile list UI
- Tests

Dependencies:

- Phase 2 Arkiv guardrails.
- Wallet connection or test stub.

Tests to add/update:

- Profile form validation tests.
- Profile create/query integration tests with mock Arkiv client or safe test harness.
- Empty-state test for no profiles.

Completion criteria:

- User can create a profile on Braga.
- User can reload and query the profile.
- All profile operations include `PROJECT_ATTRIBUTE`.

## Phase 4: Memory Record Vertical Slice

Objective:

- Implement create, read, and query for `memory_record` linked to a profile.

Files/areas likely touched:

- Memory record schema
- Arkiv memory repository/service
- Memory create/edit UI
- Record list and detail UI
- Tests

Dependencies:

- Phase 3 profile entity keys.

Tests to add/update:

- Memory form validation tests.
- Relationship query tests for `profileEntityKey`.
- Tag filtering tests.
- Empty-state test for profile with no memories.

Completion criteria:

- User can create a memory under a profile.
- User can query memories by profile and tag.
- Relationship is represented with shared attribute keys.

## Phase 5: Ownership, Update, Delete, And Failure Handling

Objective:

- Complete owner-controlled update/delete workflows and user-facing failures.

Files/areas likely touched:

- Arkiv update/delete calls
- Ownership checks
- Entity detail UI
- Confirmation dialogs
- Error handling utilities
- Tests

Dependencies:

- Wallet auth and Arkiv ownership behavior.

Tests to add/update:

- Update success test.
- Delete confirmation and success test.
- Unauthorized update/delete failure test.
- Network failure test.

Completion criteria:

- `$owner` controls update/delete.
- Authorization failures are clear.
- Destructive actions require confirmation.

## Phase 6: Privacy And Data Handling Decision

Objective:

- Decide whether the first demo encrypts memory bodies client-side or restricts itself to non-sensitive public testnet demo data.

Files/areas likely touched:

- Payload schema
- Encryption utilities if approved
- UI copy for privacy expectations
- Security documentation
- Tests

Dependencies:

- Human decision on privacy scope.
- Selected wallet/encryption approach if encryption is included.

Tests to add/update:

- Encryption/decryption round-trip tests if implemented.
- Tests proving plaintext sensitive examples are not written when encryption is required.

Completion criteria:

- Privacy behavior is explicit in the UI and README.
- Security assumptions are documented.
- Tests match the selected privacy scope.

## Phase 7: Demo Polish, README, And Deployment

Objective:

- Prepare challenge-ready demo materials.

Files/areas likely touched:

- README
- Deployment config
- UI polish
- Demo seed/test instructions
- `scripts/smoke.sh`
- `scripts/eval.sh`

Dependencies:

- Working Braga flows.
- Deployment host decision.

Tests to add/update:

- Smoke/e2e test for wallet-ready app shell and mocked or safe Arkiv workflow.
- Deployment smoke check if feasible.

Completion criteria:

- README includes setup instructions.
- Public demo link works.
- Submission requirements are documented.
- `./scripts/check.sh` passes.

## Phase 8: Review And Hardening

Objective:

- Run second-agent review and close P0/P1 findings.

Files/areas likely touched:

- Any file implicated by review findings.
- `BUILD_LOG.md`
- `BLOCKERS.md`

Dependencies:

- Complete implementation.

Tests to add/update:

- Regression tests for fixed findings.

Completion criteria:

- P0/P1 review findings are fixed or explicitly accepted by the human.
- `./scripts/check.sh` passes after fixes.
