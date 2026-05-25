# AGENTS.md

This repo uses agent-operable project documentation stored in `docs/agent/`.

Before implementation work, read:

- `DESCRIPTION.md`
- `docs/agent/PROJECT_ARCHITECTURE.md`
- `docs/agent/PRODUCT_SPEC.md`
- `docs/agent/IMPLEMENTATION_PLAN.md`
- `docs/agent/ACCEPTANCE_CRITERIA.md`
- `docs/agent/TEST_MATRIX.md`
- `docs/agent/EVALS.md`
- `docs/agent/SECURITY_RULES.md`
- `docs/agent/FAILURE_PROTOCOL.md`

During implementation:

- Maintain `docs/agent/BUILD_LOG.md`.
- Record unresolved issues in `docs/agent/BLOCKERS.md`.
- Do not declare completion unless `./scripts/check.sh` passes.
- Do not weaken acceptance criteria, tests, or security rules without human approval.
- If blocked, follow `docs/agent/FAILURE_PROTOCOL.md`.

Reviewer agents should use:

- `docs/agent/CODE_REVIEW.md`
