#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0

section() {
  printf '\n== %s ==\n' "$1"
}

run_step() {
  local label="$1"
  shift

  section "$label"
  if "$@"; then
    printf 'PASS: %s\n' "$label"
  else
    printf 'FAIL: %s\n' "$label" >&2
    failures=$((failures + 1))
  fi
}

run_step "Bootstrap review" ./scripts/review.sh
run_step "Setup check" ./scripts/setup.sh --check
run_step "Lint" ./scripts/lint.sh
run_step "Typecheck" ./scripts/typecheck.sh
run_step "Tests" ./scripts/test.sh
run_step "Smoke" ./scripts/smoke.sh
run_step "Project evals" ./scripts/eval.sh

if ((failures > 0)); then
  printf '\nAcceptance gate failed with %d failing step(s). Continue building; do not declare completion.\n' "$failures" >&2
  exit 1
fi

printf '\nAcceptance gate passed.\n'
