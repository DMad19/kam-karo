// GET /api/items and POST /api/items/voice
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { evaluateBuyerFlags } from "../services/flagsmithService.js";
import { transcribeAudio, SarvamSttError } from "../services/sarvamSttService.js";
import { extractSellerListing } from "../services/sarvamSellerService.js";
import {
  addItem,
  appendOpsLog,
  isLanguageCode,
  listItems,
  toPublicItemView,
  type Item,
  type LanguageCode,
  type PublicItemView,
} from "../store.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const listQuerySchema = z.object({
  sessionId: z.string().trim().min(1).max(100).catch("anonymous"),
  city: z.string().trim().min(1).max(60).catch("Bengaluru"),
});

const voiceBodySchema = z.object({
  textFallback: z.string().trim().max(1000).optional(),
  sellerLanguage: z.string().optional(),
  languageCode: z.string().optional(),
});

/** Seller's own listing preview: includes floorPrice so the UI can mark it "Hidden from Buyer". */
export interface SellerListingView extends PublicItemView {
  floorPrice: number;
}

export interface VoiceListingResponse {
  transcript: string;
  item: SellerListingView;
  extractionSource: "sarvam" | "fallback";
}

function toSellerListingView(item: Item): SellerListingView {
  return { ...toPublicItemView(item), floorPrice: item.floorPrice };
}

router.get("/items", async (req: Request, res: Response<PublicItemView[]>) => {
  const { sessionId, city } = listQuerySchema.parse(req.query);
  const flags = await evaluateBuyerFlags(sessionId, city);
  const multiplier = flags.cityFairPriceConfig.multiplier;
  res.json(listItems().map((item) => toPublicItemView(item, multiplier)));
});

router.post("/items/voice", upload.single("audio"), async (req: Request, res: Response) => {
  const body = voiceBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }

  const requestedLanguage = body.data.sellerLanguage ?? body.data.languageCode;
  const sellerLanguage: LanguageCode = isLanguageCode(requestedLanguage) ? requestedLanguage : "hi-IN";

  let transcript = "";
  let detectedLanguage: string | null = null;

  if (req.file && req.file.buffer.length > 0) {
    try {
      const stt = await transcribeAudio(req.file.buffer, req.file.mimetype, sellerLanguage);
      transcript = stt.transcript;
      detectedLanguage = stt.languageCode;
    } catch (error) {
      if (error instanceof SarvamSttError) {
        console.error("[items/voice] Sarvam STT error:", error.statusCode, error.responseBody);
        res.status(502).json({
          error: "Speech-to-text failed. Try the text box or a sample chip.",
          sarvamStatus: error.statusCode,
          sarvamBody: error.responseBody.slice(0, 500),
        });
        return;
      }
      throw error;
    }
  } else if (body.data.textFallback) {
    transcript = body.data.textFallback;
  }

  if (!transcript) {
    res.status(400).json({ error: "Provide an audio clip (field 'audio') or a non-empty textFallback." });
    return;
  }

  const listingLanguage: LanguageCode = isLanguageCode(detectedLanguage) ? detectedLanguage : sellerLanguage;
  const { listing, source } = await extractSellerListing(transcript, listingLanguage);
  const item = addItem({ ...listing, sellerLanguage: listingLanguage });
  appendOpsLog("ITEM_LISTED", `New listing "${item.title}" at ₹${item.askPrice} (${listingLanguage}, via ${source})`);

  const response: VoiceListingResponse = {
    transcript,
    item: toSellerListingView(item),
    extractionSource: source,
  };
  res.status(201).json(response);
});

export default router;
