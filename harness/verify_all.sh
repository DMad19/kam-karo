#!/usr/bin/env bash
# Kam Karo master gate: hygiene + server TS + offline guardrails + client TS + Vite build.
# Must exit 0 before any merge into main. The live API gate (harness/verify_api.ts)
# also runs here when the Express BFF is already up on :4000.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
API_BASE="${KAM_KARO_API:-http://localhost:4000}"

step() { echo; echo "━━ $1"; }

step "1/4 Hygiene gate"
bash harness/check_hygiene.sh

step "2/4 Server: TypeScript 7 strict + offline guardrails"
[ -d server/node_modules ] || npm --prefix server ci
(cd server && npx tsc --noEmit && npx tsx tests/guardrails.test.ts)

step "3/4 Client: TypeScript + Vite 8 build"
[ -d client/node_modules ] || npm --prefix client ci
(cd client && npx tsc -p tsconfig.app.json --noEmit && npm run build)

step "4/4 Live API contract gate"
if curl -sf -m 3 "$API_BASE/api/health" >/dev/null; then
  server/node_modules/.bin/tsx harness/verify_api.ts
else
  echo "  SKIPPED — Express BFF not running on $API_BASE."
  echo "  Start it with 'npm run dev' and run: npx tsx harness/verify_api.ts"
fi

echo
echo "✅ verify_all PASS"
