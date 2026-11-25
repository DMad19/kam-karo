// Fair-Price Meter math + Floor-Price clamp. Pure functions only — no I/O.
import type { FairPriceStatus } from "./types.js";

export interface FairPriceResult {
  adjustedBenchmark: number;
  markupPct: number;
  fairPriceStatus: FairPriceStatus;
}

/** Markup thresholds (percent over the city-adjusted benchmark). */
export const GREEN_MAX_MARKUP_PCT = 10;
export const YELLOW_MAX_MARKUP_PCT = 25;

/**
 * Compares the seller's ask against the benchmark scaled by the live
 * Flagsmith `city_fair_price_config.multiplier`.
 * GREEN <= 10% markup, YELLOW <= 25%, RED above.
 */
export function computeFairPrice(
  askPrice: number,
  benchmarkPrice: number,
  cityMultiplier: number,
): FairPriceResult {
  const safeAsk = Number.isFinite(askPrice) && askPrice > 0 ? askPrice : 0;
  const safeMultiplier = Number.isFinite(cityMultiplier) && cityMultiplier > 0 ? cityMultiplier : 1.0;
  const safeBenchmark = Number.isFinite(benchmarkPrice) && benchmarkPrice > 0 ? benchmarkPrice : 1;
  const adjustedBenchmark = Math.max(1, Math.round(safeBenchmark * safeMultiplier));
  const markupPct = Math.round(((safeAsk - adjustedBenchmark) / adjustedBenchmark) * 1000) / 10;

  let fairPriceStatus: FairPriceStatus = "RED";
  if (markupPct <= GREEN_MAX_MARKUP_PCT) {
    fairPriceStatus = "GREEN";
  } else if (markupPct <= YELLOW_MAX_MARKUP_PCT) {
    fairPriceStatus = "YELLOW";
  }

  return { adjustedBenchmark, markupPct, fairPriceStatus };
}

/**
 * Deterministic prompt-injection guardrail for LLM counter-offers:
 * always returns an integer with floorPrice <= offer <= askPrice.
 * NaN / ±Infinity collapse to floorPrice.
 */
export function clampCounterOffer(llmOffer: number, floorPrice: number, askPrice: number): number {
  const floor = Math.round(Number.isFinite(floorPrice) ? floorPrice : 0);
  const ceiling = Math.max(floor, Math.round(Number.isFinite(askPrice) ? askPrice : floor));
  if (!Number.isFinite(llmOffer)) {
    return floor;
  }
  return Math.max(floor, Math.min(ceiling, Math.round(llmOffer)));
}
