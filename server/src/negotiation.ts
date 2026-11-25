// Deterministic, neutral shopkeeper haggling strategy (the persona belongs to the BUYER, not the seller). The price is decided HERE in TypeScript;
// the LLM only writes the words around it, so the spoken reply, the Counter Offer badge,
// the Lock Deal button and the locked price are always the same number.
import { clampCounterOffer } from "./pricing.js";

export type NegotiationMove = "accept" | "counter" | "hold";

export interface NegotiationInput {
  askPrice: number;
  floorPrice: number;
  /** Last price this shopkeeper quoted to this buyer for this item (null on the first turn). */
  previousOffer: number | null;
  /** Price the buyer named in this message, if any. */
  buyerOffer: number | null;
  /** 1 for the buyer's first message on this item, 2 for the second, ... */
  round: number;
}

export interface NegotiationDecision {
  price: number;
  move: NegotiationMove;
  buyerOffer: number | null;
  /** Buyer offered far below what the seller can accept. */
  lowball: boolean;
}

/** One calm, fair shopkeeper for every buyer. */
export const SHOPKEEPER_STRATEGY = {
  /** Share of the gap (current price -> buyer's target) given up per round. */
  concession: 0.25,
  /** Smallest discount step in rupees when conceding. */
  minStep: 10,
  /** Accept when the buyer is within this fraction of the asking price of our current price. */
  acceptTolerance: 0.02,
  /** First turn with no number from the buyer: a small goodwill discount. */
  openingDiscount: 0.03,
  /** Rounds prices to a "bazaar" number. */
  roundTo: 5,
} as const;

const LOWBALL_RATIO = 0.8; // offers under 80% of the floor are lowballs

export function decideCounterOffer(input: NegotiationInput): NegotiationDecision {
  const { askPrice, floorPrice, previousOffer, buyerOffer, round } = input;
  const strategy = SHOPKEEPER_STRATEGY;
  const ask = Math.round(askPrice);
  const floor = Math.round(Math.min(floorPrice, ask));
  const current = clampCounterOffer(previousOffer ?? ask, floor, ask);
  const lowball = buyerOffer !== null && buyerOffer < floor * LOWBALL_RATIO;

  // 1. Accept: the buyer's price is acceptable and close enough to (or above) where we stand.
  if (buyerOffer !== null && buyerOffer >= floor) {
    const tolerance = Math.round(ask * strategy.acceptTolerance);
    if (buyerOffer >= current - tolerance) {
      return { price: Math.min(current, Math.round(buyerOffer)), move: "accept", buyerOffer, lowball: false };
    }
  }

  // 2. Counter: move toward the buyer (never below the floor), by the shopkeeper's steps.
  const target = Math.max(floor, buyerOffer ?? floor);
  const gap = current - target;
  if (gap <= 0) return { price: current, move: "hold", buyerOffer, lowball };

  let step: number;
  if (buyerOffer === null && round <= 1) {
    step = Math.round(ask * strategy.openingDiscount);
  } else {
    step = Math.max(strategy.minStep, Math.round(gap * strategy.concession));
  }
  step = Math.min(step, gap);

  const raw = current - step;
  const rounded = Math.round(raw / strategy.roundTo) * strategy.roundTo;
  // Rounding must never undercut the floor or go back above the current price.
  const price = clampCounterOffer(rounded > current ? raw : rounded, floor, current);

  return price >= current
    ? { price: current, move: "hold", buyerOffer, lowball }
    : { price, move: "counter", buyerOffer, lowball };
}

const PRICE_MARK_BEFORE = /(?:₹|rs\.?|inr)\s*$/i;
const PRICE_MARK_AFTER =
  /^\s*(?:\/-|rupees?|rupaye|rupaiye|rs\b|रुपये|रुपए|रुपया|ರೂಪಾಯಿ|ರೂ|రూపాయ|రూ|ரூபாய்|ரூ)/i;
const QUANTITY_AFTER =
  /^\s*(?:kgs?\b|kilos?\b|grams?\b|gms?\b|g\b|pcs?\b|pieces?\b|sets?\b|box(?:es)?\b|dabb[ae]\b|packets?\b|dozens?\b|%|percent|किलो|ग्राम|पीस|सेट|डब्ब|ಕೆಜಿ|ಕಿಲೋ|ಸೆಟ್|కిలో|సెట్|கிலோ|செட்)/i;

/**
 * The buyer's offer from their message: a currency-marked number wins, otherwise the LAST plausible
 * number that isn't a quantity ("650 bahut hai, 500 mein do" -> 500). Null when they named no price.
 */
export function findBuyerOffer(text: string): number | null {
  const marked: number[] = [];
  const plain: number[] = [];
  for (const m of text.matchAll(/\d[\d,]*/g)) {
    const value = Number(m[0].replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 10) continue;
    const start = m.index ?? 0;
    const before = text.slice(0, start);
    const after = text.slice(start + m[0].length);
    if (PRICE_MARK_BEFORE.test(before) || PRICE_MARK_AFTER.test(after)) marked.push(value);
    else if (!QUANTITY_AFTER.test(after)) plain.push(value);
  }
  const pool = marked.length > 0 ? marked : plain;
  return pool.length > 0 ? pool[pool.length - 1]! : null;
}
