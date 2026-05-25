# Failure Protocol

Use this protocol when commands, tests, evals, smoke checks, or implementation tasks fail.

## Immediate Response

1. Preserve the failing command and a concise output summary in `BUILD_LOG.md`.
2. Identify the smallest failing layer: setup, lint, typecheck, unit test, integration test, smoke, eval, or manual review.
3. Reproduce with the narrowest command possible.
4. Fix the root cause, not the symptom.
5. Re-run the narrow command.
6. Re-run broader gates only after the narrow command passes.

## Three Focused Attempts Rule

After three failed attempts on the same issue:

1. Stop trying the same fix path.
2. Add an entry to `BLOCKERS.md`.
3. Include the failing command, error summary, attempted fixes, suspected root cause, and required human decision or external action.
4. Move to another independent task if one exists.
5. If no independent task exists, ask the human for input.

## Prohibited Responses

- Do not delete tests to make the project pass.
- Do not weaken acceptance criteria without human approval.
- Do not bypass `PROJECT_ATTRIBUTE` enforcement.
- Do not ignore failing smoke or eval output.
- Do not replace a real command with a placeholder that passes.
- Do not hide failures by adding `|| true`, broad `set +e`, or silent error handling.

## Logging Requirements

For every significant failure, record in `BUILD_LOG.md`:

- Timestamp or session label
- Command run
- Exit status when known
- Error summary
- Files changed for the attempted fix
- Result after retry
- Next action

For unresolved blockers, copy the relevant information into `BLOCKERS.md`.

## When Checks Fail In `scripts/check.sh`

Fix failures in this order:

1. `scripts/review.sh`
2. `scripts/setup.sh --check`
3. `scripts/lint.sh`
4. `scripts/typecheck.sh`
5. `scripts/test.sh`
6. `scripts/smoke.sh`
7. `scripts/eval.sh`

Do not skip earlier failures to claim later success. Later scripts may be run for information, but the earliest failing required gate controls the next fix.
