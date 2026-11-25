import type { FairPriceStatus } from "./types.js";

export interface FairPriceResult {
  adjustedBenchmark: number;
  markupPct: number;
  fairPriceStatus: FairPriceStatus;
}

export function computeFairPrice(
  askPrice: number,
  benchmarkPrice: number,
  cityMultiplier: number
): FairPriceResult {
  const safeMultiplier =
    Number.isFinite(cityMultiplier) && cityMultiplier > 0 ? cityMultiplier : 1.0;
  const safeBenchmark =
    Number.isFinite(benchmarkPrice) && benchmarkPrice > 0 ? benchmarkPrice : 1;
  const adjustedBenchmark = Math.max(
    1,
    Math.round(safeBenchmark * safeMultiplier)
  );
  const markupPct =
    Math.round(((askPrice - adjustedBenchmark) / adjustedBenchmark) * 1000) /
    10;

  let fairPriceStatus: FairPriceStatus = "RED";
  if (markupPct <= 10.0) {
    fairPriceStatus = "GREEN";
  } else if (markupPct <= 25.0) {
    fairPriceStatus = "YELLOW";
  }

  return {
    adjustedBenchmark,
    markupPct,
    fairPriceStatus,
  };
}

export function clampCounterOffer(
  llmOffer: number,
  floorPrice: number,
  askPrice: number
): number {
  if (!Number.isFinite(llmOffer)) {
    return floorPrice;
  }
  return Math.max(floorPrice, Math.min(askPrice, Math.round(llmOffer)));
}
