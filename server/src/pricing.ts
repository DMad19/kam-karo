// Fair-Price Meter math + Floor-Price clamp. Pure functions only — no I/O.

export type FairPriceVerdict = "fair" | "stretch" | "overpriced";

export interface FairPriceResult {
  askPrice: number;
  adjustedBenchmark: number;
  markupPct: number;
  verdict: FairPriceVerdict;
}

/** Markup thresholds (percent over the city-adjusted benchmark). */
export const FAIR_MAX_MARKUP_PCT = 10;
export const STRETCH_MAX_MARKUP_PCT = 25;

function toFiniteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Compares the seller's ask against the benchmark scaled by the live
 * Flagsmith `city_fair_price_config.multiplier`.
 * Green (fair) <= 10% markup, Yellow (stretch) <= 25%, Red (overpriced) above.
 */
export function computeFairPrice(
  askPrice: number,
  benchmarkPrice: number,
  cityMultiplier: number,
): FairPriceResult {
  const ask = Math.max(0, toFiniteOr(askPrice, 0));
  const multiplier = toFiniteOr(cityMultiplier, 1) > 0 ? toFiniteOr(cityMultiplier, 1) : 1;
  const adjustedBenchmark = Math.round(Math.max(0, toFiniteOr(benchmarkPrice, 0)) * multiplier);

  const markupPct =
    adjustedBenchmark > 0
      ? Math.round(((ask - adjustedBenchmark) / adjustedBenchmark) * 1000) / 10
      : 0;

  const verdict: FairPriceVerdict =
    markupPct <= FAIR_MAX_MARKUP_PCT
      ? "fair"
      : markupPct <= STRETCH_MAX_MARKUP_PCT
        ? "stretch"
        : "overpriced";

  return { askPrice: ask, adjustedBenchmark, markupPct, verdict };
}

/**
 * Deterministic guardrail for LLM counter-offers:
 * always returns an integer with floorPrice <= offer <= askPrice.
 * NaN / Infinity / non-numbers collapse to floorPrice.
 */
export function clampCounterOffer(llmOffer: number, floorPrice: number, askPrice: number): number {
  const floor = Math.round(toFiniteOr(floorPrice, 0));
  const ceiling = Math.max(floor, Math.round(toFiniteOr(askPrice, floor)));
  if (typeof llmOffer !== "number" || !Number.isFinite(llmOffer)) return floor;
  return Math.min(ceiling, Math.max(floor, Math.round(llmOffer)));
}
