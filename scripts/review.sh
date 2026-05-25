#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0

section() {
  printf '\n== %s ==\n' "$1"
}

pass_review() {
  printf 'PASS: %s\n' "$1"
}

fail_review() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

section "Bootstrap Review"

required_docs=(
  "DESCRIPTION.md"
  "AGENTS.md"
  "docs/agent/PROJECT_ARCHITECTURE.md"
  "docs/agent/PRODUCT_SPEC.md"
  "docs/agent/IMPLEMENTATION_PLAN.md"
  "docs/agent/ACCEPTANCE_CRITERIA.md"
  "docs/agent/TEST_MATRIX.md"
  "docs/agent/EVALS.md"
  "docs/agent/CODE_REVIEW.md"
  "docs/agent/SECURITY_RULES.md"
  "docs/agent/FAILURE_PROTOCOL.md"
  "docs/agent/BUILD_LOG.md"
  "docs/agent/BLOCKERS.md"
  "docs/agent/QUESTIONS.md"
  "docs/agent/SUBMISSION.md"
)

for doc in "${required_docs[@]}"; do
  if [[ -s "$doc" ]]; then
    pass_review "$doc is populated."
  else
    fail_review "$doc is missing or empty."
  fi
done

required_scripts=(
  "scripts/setup.sh"
  "scripts/lint.sh"
  "scripts/typecheck.sh"
  "scripts/test.sh"
  "scripts/smoke.sh"
  "scripts/eval.sh"
  "scripts/check.sh"
  "scripts/review.sh"
)

for script in "${required_scripts[@]}"; do
  if [[ ! -f "$script" ]]; then
    fail_review "$script is missing."
    continue
  fi
  if [[ "$(sed -n '1p' "$script")" != "#!/usr/bin/env bash" ]]; then
    fail_review "$script does not start with the required shebang."
  elif [[ "$(sed -n '2p' "$script")" != "set -euo pipefail" ]]; then
    fail_review "$script does not enable strict mode on line 2."
  elif [[ ! -x "$script" ]]; then
    fail_review "$script is not executable."
  else
    pass_review "$script has required header and executable bit."
  fi
done

if grep -q "PROJECT_ATTRIBUTE" AGENTS.md docs/agent/PROJECT_ARCHITECTURE.md docs/agent/ACCEPTANCE_CRITERIA.md docs/agent/TEST_MATRIX.md docs/agent/EVALS.md; then
  pass_review "Project attribute requirement is cross-referenced."
else
  fail_review "Project attribute requirement is not sufficiently documented."
fi

if grep -q "AC-001" docs/agent/ACCEPTANCE_CRITERIA.md && grep -q "AC-017" docs/agent/ACCEPTANCE_CRITERIA.md; then
  pass_review "Acceptance criteria use numbered AC identifiers."
else
  fail_review "Acceptance criteria are missing expected AC identifiers."
fi

if grep -iq "three focused attempts" docs/agent/FAILURE_PROTOCOL.md; then
  pass_review "Failure protocol includes the three focused attempts rule."
else
  fail_review "Failure protocol is missing the three focused attempts rule."
fi

if grep -q "Requires Human Approval" docs/agent/SECURITY_RULES.md; then
  pass_review "Security rules include a human approval section."
else
  fail_review "Security rules are missing a human approval section."
fi

if grep -q "scripts/check.sh" AGENTS.md docs/agent/ACCEPTANCE_CRITERIA.md; then
  pass_review "Completion gate references scripts/check.sh."
else
  fail_review "Completion gate does not clearly reference scripts/check.sh."
fi

if ((failures > 0)); then
  printf '\nBootstrap review failed with %d failure(s).\n' "$failures" >&2
  exit 1
fi

printf '\nBootstrap review passed.\n'
