#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

section() {
  printf '\n== %s ==\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
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
    printf 'npm\n'
  fi
}

has_npm_script() {
  local script_name="$1"
  node -e "const p=require('./package.json'); process.exit(p.scripts && Object.prototype.hasOwnProperty.call(p.scripts, process.argv[1]) ? 0 : 1)" "$script_name"
}

run_npm_script() {
  local script_name="$1"
  local package_manager="$2"
  case "$package_manager" in
    pnpm) pnpm run "$script_name" ;;
    yarn) yarn "$script_name" ;;
    bun) bun run "$script_name" ;;
    npm) npm run "$script_name" ;;
    *) fail "Unsupported package manager: $package_manager" ;;
  esac
}

section "Typecheck"

[[ -f package.json ]] || fail "No package.json found and no typecheck tooling is configured. If typechecking is truly not applicable, document human approval in TEST_MATRIX.md and update this script."
command -v node >/dev/null 2>&1 || fail "Node.js is required to inspect package.json scripts."
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" >/dev/null 2>&1 || fail "package.json is invalid JSON."

package_manager="$(detect_js_package_manager)"
command -v "$package_manager" >/dev/null 2>&1 || fail "Package manager '$package_manager' is not installed or not on PATH."

if ! has_npm_script "typecheck"; then
  fail "package.json is missing scripts.typecheck. Configure a real type check such as TypeScript tsc --noEmit."
fi

run_npm_script "typecheck" "$package_manager"
