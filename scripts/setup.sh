#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CHECK_ONLY=false

section() {
  printf '\n== %s ==\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: ./scripts/setup.sh [--check]

Validates or performs local setup from the repository root.
--check validates that setup tooling is configured without installing dependencies.
USAGE
}

while (($#)); do
  case "$1" in
    --check)
      CHECK_ONLY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command '$command_name' is not installed or not on PATH."
}

detect_js_package_manager() {
  if [[ -f pnpm-lock.yaml ]]; then
    printf 'pnpm\n'
  elif [[ -f yarn.lock ]]; then
    printf 'yarn\n'
  elif [[ -f bun.lockb || -f bun.lock ]]; then
    printf 'bun\n'
  elif [[ -f package-lock.json ]]; then
    printf 'npm\n'
  else
    return 1
  fi
}

section "Setup"

if [[ -f package.json ]]; then
  require_command node
  node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" >/dev/null 2>&1 || fail "package.json is invalid JSON."

  if ! package_manager="$(detect_js_package_manager)"; then
    fail "package.json exists but no lockfile was found. Commit a deterministic lockfile before setup can install dependencies."
  fi

  require_command "$package_manager"

  if [[ "$CHECK_ONLY" == "true" ]]; then
    [[ -d node_modules ]] || fail "Dependencies are not installed. Run ./scripts/setup.sh after committing the lockfile."
    printf 'PASS: JavaScript package manager detected: %s\n' "$package_manager"
    printf 'PASS: node_modules is present.\n'
    exit 0
  fi

  case "$package_manager" in
    pnpm)
      pnpm install --frozen-lockfile
      ;;
    yarn)
      yarn install --frozen-lockfile
      ;;
    bun)
      bun install --frozen-lockfile
      ;;
    npm)
      npm ci
      ;;
    *)
      fail "Unsupported package manager: $package_manager"
      ;;
  esac
  exit 0
fi

if [[ -f pyproject.toml || -f requirements.txt ]]; then
  fail "Python config detected, but setup commands are not specified. Update scripts/setup.sh after confirming the stack in QUESTIONS.md and TEST_MATRIX.md."
fi

fail "No package/config file found. Choose and configure the project stack first. See IMPLEMENTATION_PLAN.md Phase 0 and QUESTIONS.md."
