---
trigger: glob
globs: "server/**/*.ts, server/**/*.js"
description: "Node 22+ Express 5 + TypeScript 7 coding standards, deterministic pricing guardrails, and verified Sarvam AI, Flagsmith, and NudgeBee Cloud integration patterns."
---

# Backend Coding Standards & Verified Sponsor Rules

## Express 5 & TypeScript 7 Standards
- Strict TypeScript (`strict: true`, `"types": ["node"]`), zero `any` types. Validate inputs and LLM JSON with Zod 4.
- Express 5: never use bare `*` wildcard routes; include a typed 4-arg error handler at the bottom of `index.ts`.
- Use `multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })` for multipart audio.
- Never serialize raw `Item` objects from `GET /api/items` — always project through `toPublicItemView()` omitting `floorPrice`.
- Pure math in `server/src/pricing.ts`:
  - `adjustedBenchmark = Math.round(benchmarkPrice * cityMultiplier)`
  - `markupPct = Math.round(((askPrice - adjustedBenchmark) / adjustedBenchmark) * 1000) / 10`
  - Thresholds: `<= 10.0` -> `"GREEN"`, `<= 25.0` -> `"YELLOW"`, `> 25.0` -> `"RED"`.
  - Floor clamp: `Number.isFinite(llmOffer) ? Math.max(floorPrice, Math.min(askPrice, Math.round(llmOffer))) : floorPrice`.
- Always use `AbortSignal.timeout(30_000)` on Sarvam calls and `AbortSignal.timeout(10_000)` on Flagsmith/NudgeBee calls.
- Prefix logs with `[SARVAM]`, `[FLAGSMITH]`, or `[NUDGEBEE]`. Never log API keys or tokens.

## Verified Sarvam AI Rules
- Auth: `process.env.SARVAM_API_KEY` (`api-subscription-key` header for REST, `apiKey` for OpenAI SDK).
- **STT (`saaras:v4` in `sarvamSttService.ts`):** `POST https://api.sarvam.ai/speech-to-text` via native `FormData` + `Blob`, `model="saaras:v4"`, `mode="codemix"`, `keyterms=JSON.stringify(["kaju katli","diya","laddoo","diwali","hamper","bhaiya","Bengaluru"])`. Max clip duration 30s.
- **LLM (`sarvam-105b-conversations`):** `new OpenAI({ baseURL: "https://api.sarvam.ai/v2", apiKey, timeout: 30_000 })`, `model: "sarvam-105b-conversations"` (reasoning off). Strip markdown fences before `JSON.parse()`, validate with Zod 4, provide safe fallback on parse error.
- **Native Script Rule for TTS:** Prompts MUST instruct `replyText` to write Indic words in native script (Devanagari/Kannada/Telugu/Tamil) and English loanwords in English script, under 22 words.
- **TTS (`bulbul:v4-flash` in `sarvamHaggleService.ts`):** `POST https://api.sarvam.ai/text-to-speech` with `{ text, language_code, model: "bulbul:v4-flash", speaker, enable_preprocessing: true }`. Resolve `speaker` via per-language `SPEAKER_MAP[languageCode][persona]` from env; never omit `speaker` and never use legacy `bulbul:v3` names like `"shubh"`.
- **Surge Bypass:** If `surge_lite_mode === true`, skip TTS completely and return `audioBase64: null`.

## Verified Flagsmith Rules (`flagsmithService.ts`)
- Remote HTTP evaluation (`POST process.env.FLAGSMITH_API_URL || "http://localhost:8000/api/v1/identities/"` with header `X-Environment-Key`) and ZERO local caching so NudgeBee's remote flag flip surfaces within 3 seconds.
- Wrap in `try/catch` returning safe defaults (`polite_aunty`, `false`, `{ multiplier: 1.0, label: "Fallback" }`).

## Verified NudgeBee Rules (`nudgebeeService.ts`)
- `POST` raw JSON to `process.env.NUDGEBEE_WEBHOOK_URL` with keys: `event: "diwali_surge"`, `service: "kam-karo-bazaar"`, `city`, `item_id`, `stock_remaining`, `tts_p95_latency_ms: 4300`, `error_rate: 0.19`, `recommended_action: "enable_surge_lite_mode"`.
