#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0
SUBMISSION_READY="${SUBMISSION_READY:-false}"

section() {
  printf '\n== %s ==\n' "$1"
}

pass_eval() {
  printf 'PASS: %s\n' "$1"
}

fail_eval() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

warn_eval() {
  printf 'WARN: %s\n' "$1" >&2
}

check_nonempty_file() {
  local file="$1"
  if [[ -s "$file" ]]; then
    pass_eval "$file is present and non-empty."
  else
    fail_eval "$file is missing or empty."
  fi
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
    *) fail_eval "Unsupported package manager: $package_manager"; return 1 ;;
  esac
}

redacted_file_list() {
  local item

  for item in "$@"; do
    printf '  - %s\n' "$item" >&2
  done
}

section "Project Evals"

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
  check_nonempty_file "$doc"
done

if grep -q "PROJECT_ATTRIBUTE" AGENTS.md docs/agent/PROJECT_ARCHITECTURE.md docs/agent/ACCEPTANCE_CRITERIA.md; then
  pass_eval "Project attribute is documented."
else
  fail_eval "Project attribute is not documented in required planning files."
fi

if [[ -f README.md ]]; then
  if grep -Eiq "setup|install" README.md &&
    grep -Eiq "run|dev|start|local" README.md &&
    grep -Eiq "test|check" README.md; then
    pass_eval "README.md contains setup, run, and test/check guidance."
  else
    fail_eval "README.md exists but does not clearly include setup, run, and test/check guidance."
  fi

  readme_phase7_patterns=(
    "MetaMask"
    "Braga testnet"
    "plaintext"
    "encrypted"
    "Passphrases are not recoverable|key-loss|key loss"
    "pending"
    "GitHub Pages"
    "VITE_BASE_PATH"
    "SUBMISSION_READY"
  )

  missing_readme_phase7_patterns=()
  for pattern in "${readme_phase7_patterns[@]}"; do
    if ! grep -Eiq "$pattern" README.md; then
      missing_readme_phase7_patterns+=("$pattern")
    fi
  done

  if ((${#missing_readme_phase7_patterns[@]} == 0)); then
    pass_eval "README.md contains Phase 7 Braga, privacy, pending-transaction, deployment, and submission guidance."
  else
    fail_eval "README.md is missing Phase 7 readiness guidance pattern(s)."
    redacted_file_list "${missing_readme_phase7_patterns[@]}"
  fi
else
  fail_eval "README.md is missing. Challenge submission requires setup instructions."
fi

if [[ -f docs/agent/SUBMISSION.md ]]; then
  if grep -Eq "TBD|README setup instructions complete: No|Working demo link: TBD|Public GitHub repo: TBD|Team members: TBD|Wallet address for prize distribution: TBD|Submitted: No|Requires human|Not submitted" docs/agent/SUBMISSION.md; then
    if [[ "$SUBMISSION_READY" == "true" ]]; then
      fail_eval "docs/agent/SUBMISSION.md still contains placeholder or incomplete challenge deliverables."
    else
      warn_eval "docs/agent/SUBMISSION.md is not final submission-ready. Re-run with SUBMISSION_READY=true before AC-016 is claimed."
    fi
  else
    pass_eval "docs/agent/SUBMISSION.md contains non-placeholder challenge deliverables."
  fi
else
  fail_eval "docs/agent/SUBMISSION.md is missing. Challenge deliverables need a deterministic metadata file."
fi

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
    fail_eval "$script is missing."
    continue
  fi
  if [[ "$(sed -n '1p' "$script")" != "#!/usr/bin/env bash" ]]; then
    fail_eval "$script is missing required shebang."
  elif [[ "$(sed -n '2p' "$script")" != "set -euo pipefail" ]]; then
    fail_eval "$script is missing required strict mode."
  elif [[ ! -x "$script" ]]; then
    fail_eval "$script is not executable."
  else
    pass_eval "$script has required shell header and executable bit."
  fi
done

section "Deployment Evals"

if [[ -f vite.config.ts ]] && grep -q "VITE_BASE_PATH" vite.config.ts && grep -q "base:" vite.config.ts; then
  pass_eval "Vite config supports a deploy-time base path."
else
  fail_eval "Vite config does not expose VITE_BASE_PATH static deployment support."
fi

pages_workflow=".github/workflows/deploy-pages.yml"
if [[ -f "$pages_workflow" ]]; then
  if grep -q "actions/upload-pages-artifact" "$pages_workflow" &&
    grep -q "actions/deploy-pages" "$pages_workflow" &&
    grep -q "npm ci" "$pages_workflow" &&
    grep -q "npm run build" "$pages_workflow" &&
    grep -q "VITE_BASE_PATH" "$pages_workflow"; then
    pass_eval "GitHub Pages workflow builds and deploys static Vite output without repository secrets."
  else
    fail_eval "GitHub Pages workflow exists but is missing expected static build/deploy steps."
  fi
else
  fail_eval "GitHub Pages workflow is missing."
fi

section "Security Evals"

unsafe_env_files=()
while IFS= read -r -d '' env_file; do
  case "$env_file" in
    ./.env.example|./.env.sample|./.env.template)
      ;;
    *)
      unsafe_env_files+=("${env_file#./}")
      ;;
  esac
done < <(find . -type f -name '.env*' -print0)

if ((${#unsafe_env_files[@]} > 0)); then
  fail_eval "Unsafe environment file(s) found. Commit only example/template env files."
  redacted_file_list "${unsafe_env_files[@]}"
else
  pass_eval "No unsafe .env files found."
fi

secret_pattern='(PRIVATE[_-]?KEY[[:space:]]*[:=]|MNEMONIC[[:space:]]*[:=]|SEED(_PHRASE)?[[:space:]]*[:=]|SECRET[[:space:]]*[:=]|API[_-]?KEY[[:space:]]*[:=]|BEGIN (RSA|DSA|EC|OPENSSH|PRIVATE) KEY)'
secret_files=()
while IFS= read -r -d '' file; do
  case "$file" in
    ./.git/*|./node_modules/*|./dist/*|./build/*|./coverage/*|./.next/*|./.vite/*)
      continue
      ;;
  esac
  if grep -Iq . "$file" && grep -IlE "$secret_pattern" "$file" >/dev/null 2>&1; then
    secret_files+=("${file#./}")
  fi
done < <(find . -type f -print0)

if ((${#secret_files[@]} > 0)); then
  fail_eval "Potential secret marker(s) found in file(s). Contents are redacted."
  redacted_file_list "${secret_files[@]}"
else
  pass_eval "No obvious committed secret markers found."
fi

destructive_script_pattern='rm[[:space:]]+-rf|git[[:space:]]+reset[[:space:]]+--hard|git[[:space:]]+clean[[:space:]]+-fd|drop[[:space:]]+database|truncate[[:space:]]+table'
destructive_scripts=()
while IFS= read -r -d '' script; do
  if grep -IlE "$destructive_script_pattern" "$script" >/dev/null 2>&1; then
    destructive_scripts+=("${script#./}")
  fi
done < <(find scripts -type f -name '*.sh' -print0)

if ((${#destructive_scripts[@]} > 0)); then
  fail_eval "Potential destructive command pattern found in script(s). Contents are redacted."
  redacted_file_list "${destructive_scripts[@]}"
else
  pass_eval "No obvious destructive script patterns found."
fi

source_dirs=()
for dir in src app lib components pages; do
  if [[ -d "$dir" ]]; then
    source_dirs+=("$dir")
  fi
done

section "Implementation Evals"

if ((${#source_dirs[@]} == 0)); then
  fail_eval "No implementation source directory found. Product implementation has not started."
else
  if grep -R -n "PROJECT_ATTRIBUTE" "${source_dirs[@]}" >/dev/null 2>&1 &&
    grep -R -n "arkiv-database-owned-memory-v1" "${source_dirs[@]}" >/dev/null 2>&1; then
    pass_eval "Implementation references the project attribute constant/value."
  else
    fail_eval "Implementation does not reference PROJECT_ATTRIBUTE and arkiv-database-owned-memory-v1."
  fi

  if grep -R -n "memory_profile" "${source_dirs[@]}" >/dev/null 2>&1 &&
    grep -R -n "memory_record" "${source_dirs[@]}" >/dev/null 2>&1; then
    pass_eval "Implementation references both required entity types."
  else
    fail_eval "Implementation does not reference both memory_profile and memory_record."
  fi

  if grep -R -n -i "braga" "${source_dirs[@]}" >/dev/null 2>&1; then
    pass_eval "Implementation references Braga testnet configuration."
  else
    fail_eval "Implementation does not reference Braga testnet configuration."
  fi

  if grep -R -n -i "mainnet" "${source_dirs[@]}" >/dev/null 2>&1; then
    fail_eval "Implementation references mainnet. Challenge demo must target Braga testnet unless human approval is documented."
  else
    pass_eval "No mainnet references found in implementation source."
  fi
fi

section "Arkiv Contract Eval"

if [[ -x scripts/eval-arkiv-contract.sh ]]; then
  if scripts/eval-arkiv-contract.sh; then
    pass_eval "scripts/eval-arkiv-contract.sh passed."
  else
    fail_eval "scripts/eval-arkiv-contract.sh failed."
  fi
elif [[ -f package.json ]]; then
  if ! command -v node >/dev/null 2>&1; then
    fail_eval "Node.js is required to inspect package.json for eval:arkiv-contract."
  elif ! node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" >/dev/null 2>&1; then
    fail_eval "package.json is invalid JSON."
  elif has_npm_script "eval:arkiv-contract"; then
    if package_manager="$(detect_js_package_manager)"; then
      if command -v "$package_manager" >/dev/null 2>&1; then
        if run_npm_script "eval:arkiv-contract" "$package_manager"; then
          pass_eval "Executable Arkiv contract eval passed."
        else
          fail_eval "Executable Arkiv contract eval failed."
        fi
      else
        fail_eval "Package manager '$package_manager' is not installed or not on PATH."
      fi
    else
      fail_eval "package.json exists but no lockfile was found for deterministic eval execution."
    fi
  else
    fail_eval "No executable Arkiv contract eval found. Add scripts/eval-arkiv-contract.sh or package script eval:arkiv-contract to verify entity/query builders."
  fi
else
  fail_eval "No executable Arkiv contract eval found because implementation tooling is not configured."
fi

if ((failures > 0)); then
  printf '\nProject evals failed with %d failure(s). See EVALS.md and fix the lowest failing section first.\n' "$failures" >&2
  exit 1
fi

printf '\nProject evals passed.\n'
