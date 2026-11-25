# Kam Karo — Agent Master Instructions (Team: Coffee and Chaos)

## Mission
Build **Kam Karo**, a voice-first multilingual Diwali bazaar and live haggling web app using a **Node-only TypeScript monorepo** (`client/`: React 19 + Vite 8 + Tailwind v4, `server/`: Node 22+ Express 5.3 + TypeScript 7.0) integrating **Sarvam AI**, **Flagsmith**, and **NudgeBee Cloud** with zero Python, zero Kubernetes, and zero external databases.

## Authoritative Reference Doc (Read On Demand)
- Full Technical Design Document, schemas, pre-seeded items & cross-lingual rules: @docs/TDD.md

## Hard Invariants (NEVER Violate)
1. **NODE-ONLY LATEST STABLE TS:** Zero Python files anywhere. Node 22+ LTS, Express 5 (no bare `*` wildcard routes), TypeScript 7 (`types: ["node"]`), Zod 4, Multer 2, Tailwind CSS v4 (`@tailwindcss/vite` + `@theme`, no `tailwind.config.js`), `lucide-react` v1 UI icons only.
2. **NO MOCKING SPONSORS:** Always call real Sarvam AI, Flagsmith, and NudgeBee Cloud APIs configured via `server/.env`. Graceful `try/catch` fallbacks on transient network errors are allowed; fake/mock modes are forbidden.
3. **STRICT FILE BOUNDARIES:** Respect each developer's assigned file boundary in the user prompt. Never edit files owned by another lane.
4. **DIWALI BRANDING ONLY:** Use "Kam Karo", "Coffee and Chaos", and "Diwali" / "Diwali 8 PM Rush". Never use "MandiLive" or "Dhanteras".
5. **DETERMINISTIC PRICING & PRIVACY:** Never let the LLM compute Fair-Price Meter math or undercut `floorPrice`. Never expose `floorPrice` in `GET /api/items`.
6. **NO SECRETS IN FRONTEND:** All keys live strictly inside `server/.env`. Never expose keys via `VITE_*`.
7. **ALWAYS SHIP TEXT FALLBACKS:** Every mic control must include an adjacent inline text input and 3 Diwali sample chips hitting the exact same backend pipeline.

## Working Protocol
- Always outline a concise plan before editing files.
- **Definition of Done:** Never declare a task complete until your lane's typecheck/build (and `bash harness/verify_all.sh` on merges) exits `0`.
