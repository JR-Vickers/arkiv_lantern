# Code Review Protocol

Reviewers should usually produce findings only and should not modify files unless explicitly asked. Focus on bugs, regressions, missing tests, security issues, and acceptance-criteria gaps.

## Review Inputs

- `DESCRIPTION.md`
- `ACCEPTANCE_CRITERIA.md`
- `PRODUCT_SPEC.md`
- `PROJECT_ARCHITECTURE.md`
- `TEST_MATRIX.md`
- `EVALS.md`
- Implemented code and tests
- Output from `./scripts/check.sh`
- `BUILD_LOG.md` and `BLOCKERS.md`

## Severity Levels

### P0: Must Fix Before Completion

Examples:

- Build or main check script fails.
- App cannot run.
- Main create/query workflow is broken.
- Arkiv entities or queries omit `PROJECT_ATTRIBUTE`.
- Data is stored primarily outside Arkiv.
- `$owner` update/delete authorization is bypassed.
- Committed private key, seed phrase, or production secret.
- Destructive script or migration can cause data loss.
- Security regression that exposes user data beyond documented testnet expectations.

### P1: Should Fix Before Completion

Examples:

- Missing tests for required workflows.
- Edge-case failure in validation, query filtering, or wallet switching.
- Fragile implementation likely to break in normal demo use.
- API contract mismatch with Arkiv SDK/API.
- Error states are blank or misleading.
- README setup instructions are incomplete.
- Privacy copy overstates implemented protection.

### P2: Improve If Time Allows

Examples:

- Style, naming, or minor duplication.
- Non-critical UI polish.
- Small documentation gaps.
- Refactor opportunities that do not affect behavior.

## Reviewer Output Format

Lead with findings ordered by severity. Each finding should include:

- Severity
- File and line reference when possible
- Problem
- Why it matters
- Suggested fix or verification

Then include:

- Open questions or assumptions
- Brief test coverage notes
- Short summary only after findings

If no issues are found, say so clearly and identify residual risk or unrun checks.

## Review Rules

- Do not accept completion unless `./scripts/check.sh` passes.
- Do not suggest weakening tests or criteria to pass.
- Do not ignore missing Arkiv project-attribute enforcement.
- Do not perform paid, credentialed, or destructive actions.
- Treat public testnet privacy as limited unless encryption is implemented and tested.
