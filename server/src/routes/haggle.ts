// POST /api/haggle and POST /api/deals/lock
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { computeFairPrice } from "../pricing.js";
import { languageName, surgeLiteReply } from "../prompts.js";
import { evaluateBuyerFlags } from "../services/flagsmithService.js";
import {
  generateHaggleCounterOffer,
  resolveBuyerLanguage,
  SarvamTtsError,
  synthesizeSpeech,
} from "../services/sarvamHaggleService.js";
import { SarvamSttError, transcribeAudio } from "../services/sarvamSttService.js";
import { appendOpsLog, experimentStats, getItemById, lockDeal, persistStore } from "../store.js";
import {
  HaggleBodySchema,
  LockDealBodySchema,
  type HaggleResponse,
  type HagglingPersona,
  type LockDealResponse,
} from "../types.js";

export const haggleRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

/** Unique buyer sessions per persona, so the A/B scoreboard counts buyers, not turns. */
const countedSessions: Record<HagglingPersona, Set<string>> = {
  polite_aunty: new Set(),
  savage_local: new Set(),
};

/** Last counter-offer + round per `${sessionId}:${itemId}`: the shopkeeper never goes back up. */
const lastOffers = new Map<string, { offer: number; round: number }>();
const LAST_OFFERS_LIMIT = 5_000;

function recordSession(persona: HagglingPersona, sessionId: string): void {
  const seen = countedSessions[persona];
  if (seen.has(sessionId)) return;
  seen.add(sessionId);
  experimentStats[persona].sessions += 1;
  persistStore();
}

function rememberOffer(key: string, offer: number, round: number): void {
  if (lastOffers.size >= LAST_OFFERS_LIMIT) {
    const oldest = lastOffers.keys().next().value;
    if (oldest !== undefined) lastOffers.delete(oldest);
  }
  lastOffers.set(key, { offer, round });
}

/** Runs Multer and turns upload errors into 400/413 instead of bare 500s. */
function receiveAudio(req: Request, res: Response, next: NextFunction): void {
  upload.single("audio")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const isMulter = error instanceof multer.MulterError;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[HAGGLE] audio upload rejected:", isMulter ? error.code : "", message);
    const status = isMulter && error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ error: `Audio upload rejected: ${message}` });
  });
}

haggleRouter.post("/haggle", receiveAudio, async (req: Request, res: Response) => {
  const startedAt = performance.now();
  const body = HaggleBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }
  const { itemId, sessionId, city, language_code: requestedLanguage, textFallback } = body.data;

  const item = getItemById(itemId);
  if (!item) {
    res.status(404).json({ error: `Item not found: ${itemId}` });
    return;
  }
  if (item.stock <= 0) {
    res.status(409).json({ error: `${item.title} is sold out for this Diwali.` });
    return;
  }

  const hasAudio = Boolean(req.file && req.file.buffer.length > 0);
  const flags = await evaluateBuyerFlags(sessionId, city);
  const persona = flags.haggling_persona;
  const multiplier = flags.city_fair_price_config.multiplier;
  const { adjustedBenchmark } = computeFairPrice(item.askPrice, item.benchmarkPrice, multiplier);
  recordSession(persona, sessionId);

  // Diwali 8 PM Rush short-circuit (TDD §6.4): no STT, no LLM, no TTS — fixed fair price as text.
  if (flags.surge_lite_mode) {
    const fixedPrice = Math.min(item.askPrice, Math.max(item.floorPrice, Math.round(adjustedBenchmark)));
    // Fair-Price Meter for the price actually on offer, not the original ask.
    const { markupPct, fairPriceStatus } = computeFairPrice(fixedPrice, item.benchmarkPrice, multiplier);
    const buyerLanguage = resolveBuyerLanguage("unknown", requestedLanguage, textFallback ?? "");
    const response: HaggleResponse = {
      buyerTranscript: textFallback ?? "",
      buyerOriginalText: textFallback ?? "",
      detectedLanguage: buyerLanguage,
      sellerLanguage: item.sellerLanguage,
      crossLingualBridge: buyerLanguage !== item.sellerLanguage,
      personaUsed: persona,
      shopkeeperReplyText: surgeLiteReply(buyerLanguage, fixedPrice),
      counterOfferPrice: fixedPrice,
      dealAccepted: false,
      fairPriceStatus,
      markupPct,
      audioBase64: null,
      surgeLiteMode: true,
    };
    console.log(`[PRICING] surge_lite_mode fixed price ₹${fixedPrice} for ${item.id} in ${Math.round(performance.now() - startedAt)}ms`);
    res.json(response);
    return;
  }

  let buyerTranscript = "";
  let detectedLanguage = requestedLanguage;

  if (hasAudio && req.file) {
    try {
      const stt = await transcribeAudio(req.file.buffer, req.file.mimetype, requestedLanguage);
      buyerTranscript = stt.transcript;
      detectedLanguage = stt.detectedLanguage;
    } catch (error) {
      if (error instanceof SarvamSttError) {
        console.error("[SARVAM] haggle STT error:", error.statusCode, error.responseBody.slice(0, 500));
        res.status(502).json({
          error: "Speech-to-text failed. Try the text box or a sample chip.",
          sarvamStatus: error.statusCode,
        });
        return;
      }
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error("[SARVAM] haggle STT request did not complete:", reason);
      res.status(502).json({ error: `Speech-to-text unavailable (${reason}). Try the text box or a sample chip.` });
      return;
    }
  }
  if (!buyerTranscript && textFallback) buyerTranscript = textFallback;

  if (!buyerTranscript) {
    res.status(400).json({ error: "Provide an audio clip (field 'audio') or a non-empty textFallback." });
    return;
  }

  const buyerLanguage = resolveBuyerLanguage(detectedLanguage, requestedLanguage, buyerTranscript);
  const offerKey = `${sessionId}:${item.id}`;
  const last = lastOffers.get(offerKey);
  const round = (last?.round ?? 0) + 1;
  const turn = await generateHaggleCounterOffer({
    item,
    buyerTranscript,
    buyerLanguage,
    persona,
    previousOffer: last?.offer ?? null,
    round,
  });
  rememberOffer(offerKey, turn.counterOfferPrice, round);
  // Fair-Price Meter for the price the shopkeeper just quoted (what the buyer would actually pay).
  const { markupPct, fairPriceStatus } = computeFairPrice(turn.counterOfferPrice, item.benchmarkPrice, multiplier);

  let audioBase64: string | null = null;
  try {
    audioBase64 = await synthesizeSpeech(turn.replyText, buyerLanguage);
  } catch (error) {
    // Text reply still works; the UI shows it without audio.
    if (error instanceof SarvamTtsError) {
      console.error("[SARVAM] TTS error:", error.message, error.responseBody.slice(0, 300));
    } else {
      console.error("[SARVAM] TTS request did not complete:", error instanceof Error ? error.message : error);
    }
  }

  const response: HaggleResponse = {
    // "Buyer Said" = the user's words re-voiced in their Flagsmith haggling persona (same offer).
    buyerTranscript: turn.buyerLine,
    buyerOriginalText: buyerTranscript,
    detectedLanguage: buyerLanguage,
    sellerLanguage: item.sellerLanguage,
    crossLingualBridge: buyerLanguage !== item.sellerLanguage,
    personaUsed: persona,
    shopkeeperReplyText: turn.replyText,
    counterOfferPrice: turn.counterOfferPrice,
    dealAccepted: turn.dealAccepted,
    fairPriceStatus,
    markupPct,
    audioBase64,
    surgeLiteMode: false,
  };
  console.log(
    `[SARVAM] haggle ${item.id} ${persona} ${buyerLanguage} round ${round} ${turn.move} -> ₹${turn.counterOfferPrice} (${turn.source}, audio=${audioBase64 ? "yes" : "no"}) in ${Math.round(performance.now() - startedAt)}ms`,
  );
  res.json(response);
});

haggleRouter.post("/deals/lock", (req: Request, res: Response) => {
  const body = LockDealBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }
  const { itemId, finalPrice, personaUsed } = body.data;
  const price = Math.round(finalPrice);

  const item = getItemById(itemId);
  if (!item) {
    res.status(404).json({ error: `Item not found: ${itemId}` });
    return;
  }
  // The surge fixed fair price is max(floorPrice, adjustedBenchmark), so it always clears this check.
  if (price < item.floorPrice) {
    res.status(400).json({ error: "That price is below what the seller can accept. Haggle again for a fair counter-offer." });
    return;
  }

  // Synchronous: stock check + decrement + A/B stats with zero awaits in between.
  const outcome = lockDeal(itemId, price, personaUsed);
  if (!outcome.ok) {
    if (outcome.reason === "NOT_FOUND") {
      res.status(404).json({ error: `Item not found: ${itemId}` });
    } else {
      res.status(409).json({ error: `${item.title} is sold out for this Diwali.` });
    }
    return;
  }

  const sellerLang = languageName(outcome.item.sellerLanguage);
  const notificationNote = `Deal locked at ₹${price} — seller notified in ${sellerLang}`;
  // Seller-facing record stays neutral: the persona is only the buyer's shopkeeper style (A/B stats track it separately).
  appendOpsLog("INFO", `${notificationNote} (${outcome.item.title}, ${outcome.remainingStock} left)`);

  const response: LockDealResponse = {
    itemId: outcome.item.id,
    remainingStock: outcome.remainingStock,
    sellerLanguage: outcome.item.sellerLanguage,
    notificationNote,
    experimentStats,
  };
  res.json(response);
});

export default haggleRouter;
