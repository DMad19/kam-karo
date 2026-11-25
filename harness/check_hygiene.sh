#!/usr/bin/env bash
# Kam Karo hygiene gate: no frontend secrets, no mock bypasses, no stale branding, no Python, no tracked .env.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

failures=0
fail() { echo "  ✗ $1"; failures=$((failures + 1)); }
pass() { echo "  ✓ $1"; }

# grep wrapper: prints matches, returns 0 if anything matched.
hits() { grep -rnIE "$@" 2>/dev/null; }

echo "Kam Karo hygiene gate"

# 1. No server secrets or secret-bearing VITE_ vars in the client bundle source.
if [ -d client/src ]; then
  if hits '(SARVAM_API_KEY|FLAGSMITH_SERVER_KEY|FLAGSMITH_ORG_API_KEY|NUDGEBEE_WEBHOOK_URL|NB_ACCESS_(KEY|SECRET)|api-subscription-key|X-Environment-Key|Api-Key |ser\.[A-Za-z0-9]{10,}|webhooks/workflow\?token=)' client/src client/index.html client/vite.config.ts; then
    fail "server secrets referenced in client/"
  else
    pass "no server secrets in client/"
  fi
  if hits 'VITE_[A-Z_]*(KEY|SECRET|TOKEN|WEBHOOK)' client/src client/vite.config.ts; then
    fail "secret-like VITE_* variable in client/"
  else
    pass "no secret VITE_* variables"
  fi
fi

# 2. No mock / fake / demo bypass modes in sponsor integrations.
# Negated mentions in comments ("no mocks", "never mock") are allowed.
mock_hits="$(hits '(mock|fake|stub|DEMO_MODE|MOCK_MODE|USE_MOCK|offline_mode|bypassSponsor)' server/src/services server/src/routes \
  | grep -viE '(no|never|zero|without) (fake/)?mock' || true)"
if [ -n "$mock_hits" ]; then
  echo "$mock_hits"
  fail "mock/fake bypass found in server/src/services or server/src/routes"
else
  pass "no mock bypasses in server services/routes"
fi

# 3. Stale branding (spec docs and this harness legitimately name the banned terms).
if hits '(MandiLive|Dhanteras)' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=docs \
  --exclude-dir=.agents --exclude-dir=harness \
  --exclude=AGENTS.md --exclude='kam_karo_*.md' .; then
  fail "stale branding (MandiLive/Dhanteras) found"
else
  pass "Diwali branding only"
fi

# 4. Node-only: zero Python files.
py_files="$(find . -name '*.py' -not -path '*/node_modules/*' -not -path './.git/*' 2>/dev/null)"
if [ -n "$py_files" ]; then
  echo "$py_files"
  fail "Python files present"
else
  pass "zero Python files"
fi

# 5. No .env files tracked by git (templates are fine).
if command -v git >/dev/null && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  tracked_env="$(git ls-files | grep -E '(^|/)\.env$' || true)"
  if [ -n "$tracked_env" ]; then
    echo "$tracked_env"
    fail ".env file tracked by git"
  else
    pass "no .env tracked by git"
  fi
fi

# 6. Express 5: no bare '*' wildcard routes.
if hits "\.(get|post|put|patch|delete|all|use)\(\s*['\"]\*['\"]" server/src; then
  fail "bare '*' wildcard route (Express 5 incompatible)"
else
  pass "no bare '*' wildcard routes"
fi

if [ "$failures" -gt 0 ]; then
  echo "FAIL — $failures hygiene check(s) failed"
  exit 1
fi
echo "PASS — hygiene"
