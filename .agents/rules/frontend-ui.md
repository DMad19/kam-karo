---
trigger: glob
globs: "client/**/*.tsx, client/**/*.ts, client/**/*.css"
description: "React 19 + Tailwind CSS v4 standards, 5-color Diwali palette, anti-slop layout, 25s mic guard, and surge-mode UI transitions."
---

# Frontend Coding Standards & UI Design Rules

## Strict TypeScript & Tailwind v4
- Zero `any` types. Keep shared API types in `client/src/types/index.ts`.
- All HTTP calls live in `client/src/api/kamKaroApi.ts` — never call `fetch()` inside components.
- Use Tailwind CSS v4 theme classes (`bg-plum`, `bg-marigold`, `bg-gold`, `bg-vermilion`, `bg-canvas`, `text-ink`) defined in `client/src/index.css`. Ban generic purple/indigo AI SaaS gradients.
- Use standard UI icons from `lucide-react` v1 only (brand icons were removed in v1).

## Layout & UX Mandates
- Open directly into the working 2-tab workspace (`Dukaan Mic` & `Bargain Mic`). Zero landing page or login modal.
- **Audio Guard (`useAudioRecorder.ts`):** Hard 25-second countdown auto-stop on `MediaRecorder`; stop all media tracks on stop; display inline hint pointing to Text Fallback if mic fails.
- **Cross-Lingual Bridge Badge:** In Tab 2, whenever `buyerLanguage !== selectedItem.sellerLanguage`, render a Diya Gold pill (`Listed in [Seller Lang] <-> Negotiating in [Buyer Lang]`).
- **Flagsmith Poll (`useFlagsmithPoll.ts`):** Poll `GET /api/flags` every `3000ms` + expose manual `Sync Now` button + highlight `SELF_HEALED` when `surge_lite_mode` transitions `false -> true`.
- **Surge Mode UI (`surge_lite_mode === true`):** Switch TopBar pill to Diya Gold `SURGE PROTECTION: TEXT LITE`, disable Buyer Haggling Mic, display rush-protection banner, and show one Marigold `Instant Buy at Fair Price` button.
