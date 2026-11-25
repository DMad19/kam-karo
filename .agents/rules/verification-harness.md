---
trigger: model_decision
description: "Apply whenever testing, debugging, running harnesses, or finishing a feature block in Kam Karo."
---

# Verification Harness Protocol

1. Backend check: `(cd server && npx tsc --noEmit && npx tsx tests/guardrails.test.ts)`
2. Frontend check: `(cd client && npx tsc --noEmit && npm run build)`
3. Pre-merge master gate: `bash harness/verify_all.sh` (must exit `0`).
4. Live API gate (with Express on `:4000`): `npx tsx harness/verify_api.ts` (must verify `GET /api/items`, `GET /api/flags`, `POST /api/haggle`, prompt-injection ₹1 floor clamp, and zero `floorPrice` leakage).
5. Never weaken test assertions or insert mock bypasses to pass a check.
