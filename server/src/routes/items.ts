// GET /api/items and POST /api/items/voice
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { evaluateBuyerFlags } from "../services/flagsmithService.js";
import { extractSellerListing } from "../services/sarvamSellerService.js";
import { SarvamSttError, transcribeAudio } from "../services/sarvamSttService.js";
import { addItem, appendOpsLog, getItems, nextItemId, toPublicItemView } from "../store.js";
import {
  CreateVoiceItemBodySchema,
  GetItemsQuerySchema,
  type CityFairPriceConfig,
  type CityName,
  type CreateVoiceItemResponse,
  type GetItemsResponse,
  type Item,
} from "../types.js";

export const itemsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const CATALOG_IDENTITY = "catalog_viewer";
const DEFAULT_CITY_CONFIG: CityFairPriceConfig = { multiplier: 1.0, label: "Standard" };

/** Live Flagsmith city multiplier; falls back to 1.0 if Flagsmith is unreachable (TDD §5). */
async function resolveCityConfig(sessionId: string, city: CityName): Promise<CityFairPriceConfig> {
  try {
    const flags = await evaluateBuyerFlags(sessionId, city);
    const { multiplier, label } = flags.city_fair_price_config;
    return Number.isFinite(multiplier) && multiplier > 0 ? { multiplier, label } : DEFAULT_CITY_CONFIG;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[FLAGSMITH] city config unavailable, using multiplier 1.0:", reason);
    return DEFAULT_CITY_CONFIG;
  }
}

itemsRouter.get("/items", async (req: Request, res: Response) => {
  const query = GetItemsQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query", details: query.error.issues });
    return;
  }
  const sessionId =
    typeof req.query.sessionId === "string" && req.query.sessionId.trim() ? req.query.sessionId.trim() : CATALOG_IDENTITY;

  const cityConfig = await resolveCityConfig(sessionId, query.data.city);
  const response: GetItemsResponse = {
    items: getItems().map((item) => toPublicItemView(item, cityConfig.multiplier)),
    cityMultiplier: cityConfig.multiplier,
    cityLabel: cityConfig.label,
  };
  res.json(response);
});

itemsRouter.post("/items/voice", upload.single("audio"), async (req: Request, res: Response) => {
  const body = CreateVoiceItemBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }
  const { textFallback, language_code: requestedLanguage, city } = body.data;

  let transcript = "";
  let detectedLanguage = requestedLanguage;

  if (req.file && req.file.buffer.length > 0) {
    try {
      const stt = await transcribeAudio(req.file.buffer, req.file.mimetype, requestedLanguage);
      transcript = stt.transcript;
      detectedLanguage = stt.detectedLanguage;
    } catch (error) {
      if (error instanceof SarvamSttError) {
        console.error("[SARVAM] STT error:", error.statusCode, error.responseBody.slice(0, 500));
        res.status(502).json({
          error: "Speech-to-text failed. Try the text box or a sample chip.",
          sarvamStatus: error.statusCode,
          sarvamBody: error.responseBody.slice(0, 500),
        });
        return;
      }
      throw error;
    }
  } else if (textFallback) {
    transcript = textFallback;
  }

  if (!transcript) {
    res.status(400).json({ error: "Provide an audio clip (field 'audio') or a non-empty textFallback." });
    return;
  }

  const sellerLanguage = detectedLanguage === "unknown" ? requestedLanguage : detectedLanguage;
  const { listing, source } = await extractSellerListing(transcript, sellerLanguage);
  const item: Item = { id: nextItemId(), ...listing, city, sellerLanguage };
  addItem(item);
  appendOpsLog("INFO", `New listing "${item.title}" at ₹${item.askPrice} in ${city} (${sellerLanguage}, via ${source})`);

  // Seller's own preview: includes floorPrice so Tab 1 can mark it "Hidden from Buyer".
  const response: CreateVoiceItemResponse = { transcript, detectedLanguage, item };
  res.status(201).json(response);
});

export default itemsRouter;
