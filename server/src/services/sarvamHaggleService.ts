// Real Sarvam AI haggling: `sarvam-105b-conversations` counter-offers + `bulbul:v4-flash` TTS (no mocks).
import OpenAI from "openai";
import { config } from "../config.js";
import { decideCounterOffer, findBuyerOffer, type NegotiationMove } from "../negotiation.js";
import {
  buildHaggleTurnPrompt,
  buildHaggleUserPrompt,
  fallbackBuyerLine,
  fallbackShopLine,
  type BuyerLanguage,
} from "../prompts.js";
import type { HagglingPersona, Item } from "../types.js";

const SARVAM_LLM_BASE_URL = "https://api.sarvam.ai/v2";
const HAGGLE_MODEL = "sarvam-105b-conversations";
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const TTS_MODEL = "bulbul:v4-flash";

const BUYER_LANGUAGES: readonly BuyerLanguage[] = ["hi-IN", "kn-IN", "te-IN", "ta-IN", "en-IN"];

export function isBuyerLanguage(code: string): code is BuyerLanguage {
  return (BUYER_LANGUAGES as readonly string[]).includes(code);
}

const SCRIPT_RANGES: ReadonlyArray<[BuyerLanguage, RegExp]> = [
  ["hi-IN", /[ऀ-ॿ]/],
  ["kn-IN", /[ಀ-೿]/],
  ["te-IN", /[ఀ-౿]/],
  ["ta-IN", /[஀-௿]/],
];

/**
 * Buyer language priority: STT-detected code -> TopBar-selected code -> script of the
 * typed text -> Hindi (Latin text is usually Hinglish at a Diwali bazaar, which
 * hi-IN TTS speaks naturally).
 */
export function resolveBuyerLanguage(detected: string, requested: string, text: string): BuyerLanguage {
  if (isBuyerLanguage(detected)) return detected;
  if (isBuyerLanguage(requested)) return requested;
  for (const [code, pattern] of SCRIPT_RANGES) {
    if (pattern.test(text)) return code;
  }
  return "hi-IN";
}

/**
 * The shopkeeper speaks in one neutral voice per language (the "polite" speaker slots from server/.env);
 * the haggling persona belongs to the buyer, so it no longer changes the shopkeeper's voice.
 */
export function resolveShopkeeperSpeaker(language: BuyerLanguage): string {
  return resolveSpeaker(language, "polite_aunty");
}

/** Per-language speaker map for bulbul:v4-flash; empty overrides fall back to the verified base speakers. */
export function resolveSpeaker(language: BuyerLanguage, persona: HagglingPersona): string {
  const s = config.sarvamSpeakers;
  const base = persona === "polite_aunty" ? s.polite : s.savage;
  const SPEAKER_MAP: Record<BuyerLanguage, Record<HagglingPersona, string>> = {
    "hi-IN": { polite_aunty: s.polite, savage_local: s.savage },
    "en-IN": { polite_aunty: s.polite, savage_local: s.savage },
    "kn-IN": { polite_aunty: s.knPolite, savage_local: s.knSavage },
    "te-IN": { polite_aunty: s.tePolite, savage_local: s.teSavage },
    "ta-IN": { polite_aunty: s.taPolite, savage_local: s.taSavage },
  };
  return SPEAKER_MAP[language][persona] || base || s.polite;
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.sarvamApiKey) throw new Error("SARVAM_API_KEY is not set in server/.env");
  client ??= new OpenAI({
    apiKey: config.sarvamApiKey,
    baseURL: SARVAM_LLM_BASE_URL,
    defaultHeaders: { "api-subscription-key": config.sarvamApiKey },
    timeout: 30_000,
    maxRetries: 1,
  });
  return client;
}

/** Strips <think> blocks and ``` fences, then returns the outermost {...} block. */
export function extractJsonBlock(raw: string): string | null {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start !== -1 && end > start ? cleaned.slice(start, end + 1) : null;
}

const INDIC_DIGIT_BASES = [0x0966, 0x0ce6, 0x0c66, 0x0be6]; // Devanagari, Kannada, Telugu, Tamil

/** "₹५९०" -> "₹590" so the reply, the badge and TTS all show the same digits. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[०-९೦-೯౦-౯௦-௯]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = INDIC_DIGIT_BASES.find((b) => code >= b && code <= b + 9) ?? code;
    return String(code - base);
  });
}

const PREFIX_PRICE = /(?:₹|rs\.?|inr)\s*(\d[\d,]*)/gi;
const SUFFIX_PRICE = /(\d[\d,]*)\s*(?:rupees?|rupaye|rupaiye|रुपये|रुपए|रुपया|ರೂಪಾಯಿ|ರೂ|రూపాయ|రూ|ரூபாய்|ரூ)/gi;

/** Every price quoted in the text (₹580, ₹ 1,250, Rs. 600, 280 रुपये, 300 ರೂಪಾಯಿ). */
export function quotedPrices(text: string): number[] {
  const matches = [...text.matchAll(PREFIX_PRICE), ...text.matchAll(SUFFIX_PRICE)];
  return matches.map((m) => Number((m[1] ?? "").replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

function normalizeNumbers(text: string): string {
  return toAsciiDigits(text).replace(/(\d),(\d)/g, "$1$2");
}

/**
 * True when the line mentions `required` (if given) and no amount outside `allowed`
 * (product-name numbers like "Set of 24" are always allowed; tiny ₹ amounts like "₹1" are not).
 */
export function linePricesValid(line: string, required: number | null, allowed: number[], title: string): boolean {
  const text = normalizeNumbers(line);
  const ok = new Set<number>(allowed);
  if (required !== null) ok.add(required);
  const titleNumbers = new Set((title.match(/\d+/g) ?? []).map(Number));

  const hasRequired = required === null || new RegExp(`(^|\\D)${required}(\\D|$)`).test(text);
  const strayNumber = (text.match(/\d+/g) ?? []).map(Number).some((n) => n >= 10 && !ok.has(n) && !titleNumbers.has(n));
  const strayPrice = quotedPrices(text).some((n) => !ok.has(n));
  return hasRequired && !strayNumber && !strayPrice;
}

/** Shopkeeper line must say exactly the decided price (it may also mention the buyer's offer or the ask). */
export function replyMatchesPrice(
  reply: string,
  price: number,
  buyerOffer: number | null,
  title: string,
  askPrice?: number,
): boolean {
  const allowed = [price, ...(buyerOffer !== null ? [buyerOffer] : []), ...(askPrice !== undefined ? [askPrice] : [])];
  return linePricesValid(reply, price, allowed, title);
}

/** Buyer's persona line must keep the user's own number (and invent none; mentioning the ask is fine). */
export function buyerLineValid(
  line: string,
  buyerOffer: number | null,
  askPrice: number,
  title: string,
  previousOffer: number | null = null,
): boolean {
  return linePricesValid(line, buyerOffer, [askPrice, ...(previousOffer !== null ? [previousOffer] : [])], title);
}

/** Reads "BUYER: ..." and "SHOP: ..." lines (also tolerates JSON {"buyer","shop"}). */
export function parseHaggleLines(content: string): { buyer: string | null; shop: string | null } {
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "").trim();
  const strip = (s: string | undefined): string | null => {
    const t = (s ?? "").replace(/^["'“”*\s]+|["'“”*\s]+$/g, "").replace(/\s+/g, " ").trim();
    return t.length > 0 && t.length <= 400 ? t : null;
  };
  const buyer = /^\W*buyer\W*:\s*(.+)$/im.exec(cleaned)?.[1];
  const shop = /^\W*(?:shop|shopkeeper|seller)\W*:\s*(.+)$/im.exec(cleaned)?.[1];
  if (buyer || shop) return { buyer: strip(buyer), shop: strip(shop) };
  const json = extractJsonBlock(cleaned);
  if (json) {
    try {
      const o = JSON.parse(json) as Record<string, unknown>;
      return {
        buyer: strip(typeof o.buyer === "string" ? o.buyer : undefined),
        shop: strip(typeof o.shop === "string" ? o.shop : typeof o.replyText === "string" ? o.replyText : undefined),
      };
    } catch {
      // fall through
    }
  }
  return { buyer: null, shop: null };
}

export interface HaggleTurnInput {
  item: Item;
  /** Exactly what the user said or typed. */
  buyerTranscript: string;
  buyerLanguage: BuyerLanguage;
  /** Buyer's haggling personality from Flagsmith. */
  persona: HagglingPersona;
  previousOffer: number | null;
  round: number;
}

export interface HaggleTurnResult {
  /** The user's message rewritten in the buyer persona's voice (same offer). */
  buyerLine: string;
  counterOfferPrice: number;
  dealAccepted: boolean;
  move: NegotiationMove;
  /** Neutral shopkeeper reply; always contains exactly counterOfferPrice. */
  replyText: string;
  source: "sarvam" | "fallback";
}

/**
 * One haggling turn:
 *  1. negotiation.ts decides the price + move (deterministic, floor-safe, neutral shopkeeper).
 *  2. One LLM call writes BOTH lines: the user's message re-voiced in the buyer persona, and the
 *     shopkeeper's neutral reply carrying the decided price.
 *  3. Each line is checked; a wrong number in either swaps in a fixed line for that side only.
 */
export async function generateHaggleCounterOffer(input: HaggleTurnInput): Promise<HaggleTurnResult> {
  const { item, buyerTranscript, buyerLanguage, persona, previousOffer, round } = input;
  const buyerOffer = findBuyerOffer(toAsciiDigits(buyerTranscript));
  const decision = decideCounterOffer({
    askPrice: item.askPrice,
    floorPrice: item.floorPrice,
    previousOffer,
    buyerOffer,
    round,
  });
  const base = { counterOfferPrice: decision.price, dealAccepted: decision.move === "accept", move: decision.move };
  const fixedBuyer = () => fallbackBuyerLine(buyerLanguage, persona, buyerOffer, item.askPrice);
  const fixedShop = () => fallbackShopLine(buyerLanguage, decision.move, decision.price);

  try {
    const completion = await getClient().chat.completions.create({
      model: HAGGLE_MODEL,
      temperature: 0.7,
      max_tokens: 260,
      messages: [
        {
          role: "system",
          content: buildHaggleTurnPrompt({
            item,
            persona,
            buyerLanguage,
            price: decision.price,
            move: decision.move,
            buyerOffer,
            previousOffer,
            round,
          }),
        },
        { role: "user", content: buildHaggleUserPrompt(buyerTranscript) },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const lines = parseHaggleLines(content);
    if (!lines.buyer && !lines.shop) throw new Error(`Unusable model output: ${content.slice(0, 200)}`);

    const buyerLine = lines.buyer ? toAsciiDigits(lines.buyer) : null;
    const shopLine = lines.shop ? toAsciiDigits(lines.shop) : null;
    const buyerOk = buyerLine !== null && buyerLineValid(buyerLine, buyerOffer, item.askPrice, item.title, previousOffer);
    const shopOk = shopLine !== null && replyMatchesPrice(shopLine, decision.price, buyerOffer, item.title, item.askPrice);
    if (!buyerOk) console.warn(`[PRICING] buyer line changed the offer (${buyerOffer ?? "none"}): "${buyerLine?.slice(0, 80)}"; using persona line`);
    if (!shopOk) console.warn(`[PRICING] shop line did not say exactly ₹${decision.price}: "${shopLine?.slice(0, 80)}"; using fixed line`);

    return {
      ...base,
      buyerLine: buyerOk && buyerLine ? buyerLine : fixedBuyer(),
      replyText: shopOk && shopLine ? shopLine : fixedShop(),
      source: buyerOk || shopOk ? "sarvam" : "fallback",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[SARVAM] haggle LLM failed, using fixed buyer + shop lines:", reason.slice(0, 300));
    return { ...base, buyerLine: fixedBuyer(), replyText: fixedShop(), source: "fallback" };
  }
}

export class SarvamTtsError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = "SarvamTtsError";
  }
}

/** bulbul:v4-flash TTS. Returns a `data:audio/wav;base64,...` URI ready for <audio src>. */
export async function synthesizeSpeech(text: string, languageCode: BuyerLanguage): Promise<string> {
  if (!config.sarvamApiKey) throw new SarvamTtsError("SARVAM_API_KEY is not set in server/.env", 500, "");
  const speaker = resolveShopkeeperSpeaker(languageCode);

  const response = await fetch(SARVAM_TTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": config.sarvamApiKey,
    },
    body: JSON.stringify({
      text,
      language_code: languageCode,
      model: TTS_MODEL,
      speaker,
      enable_preprocessing: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new SarvamTtsError(`Sarvam TTS failed (${response.status}, speaker=${speaker})`, response.status, body);
  }

  const data = (await response.json()) as { audios?: unknown };
  const audio = Array.isArray(data.audios) ? data.audios[0] : undefined;
  if (typeof audio !== "string" || audio.length === 0) {
    throw new SarvamTtsError("Sarvam TTS returned no audio", response.status, JSON.stringify(data).slice(0, 300));
  }
  return audio.startsWith("data:") ? audio : `data:audio/wav;base64,${audio}`;
}
