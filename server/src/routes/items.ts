// GET /api/items and POST /api/items/voice
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { evaluateBuyerFlags } from "../services/flagsmithService.js";
import { extractSellerListing } from "../services/sarvamSellerService.js";
import { SarvamSttError, transcribeAudio } from "../services/sarvamSttService.js";
import { addItem, appendOpsLog, getItemById, getItems, nextItemId, PHOTOS_DIR, toPublicItemView } from "../store.js";
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
  // fieldSize: the seller photo arrives as a base64 data-URL text field (Multer default is only 1 MB).
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fieldSize: 8 * 1024 * 1024 },
});

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Decodes a "data:image/jpeg;base64,..." seller photo; null if absent or not an allowed image. */
function decodePhoto(dataUrl: unknown): { buffer: Buffer; ext: string } | null {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) return null;
  // Trust the bytes, not the declared type.
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isWebp = buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP";
  const ext = isJpeg ? "jpg" : isPng ? "png" : isWebp ? "webp" : null;
  if (!ext) return null;
  return { buffer, ext };
}

/** "/api/items/item_04/photo" -> "http://localhost:4000/api/items/item_04/photo" (client runs on another origin). */
function absoluteUrl(req: Request, relative: string | undefined): string | undefined {
  return relative ? `${req.protocol}://${req.get("host")}${relative}` : undefined;
}

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
    items: getItems().map((item) => {
      const view = toPublicItemView(item, cityConfig.multiplier);
      return view.imageUrl ? { ...view, imageUrl: absoluteUrl(req, view.imageUrl) } : view;
    }),
    cityMultiplier: cityConfig.multiplier,
    cityLabel: cityConfig.label,
  };
  res.json(response);
});

/** Serves a saved seller photo. The file name comes from the store, never from the URL. */
itemsRouter.get("/items/:id/photo", (req: Request<{ id: string }>, res: Response) => {
  const item = getItemById(req.params.id);
  if (!item?.photoFile) {
    res.status(404).json({ error: "No photo for this item" });
    return;
  }
  res.set("Cache-Control", "public, max-age=86400");
  res.sendFile(path.join(PHOTOS_DIR, path.basename(item.photoFile)), (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: "Photo file missing" });
  });
});

/** Runs Multer and turns upload errors (size limit, malformed form) into logged 400/413s instead of bare 500s. */
function receiveAudio(req: Request, res: Response, next: NextFunction): void {
  upload.single("audio")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const isMulter = error instanceof multer.MulterError;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ITEMS] audio upload rejected:", isMulter ? error.code : "", message);
    const status = isMulter && error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ error: `Audio upload rejected: ${message}` });
  });
}

itemsRouter.post("/items/voice", receiveAudio, async (req: Request, res: Response) => {
  const body = CreateVoiceItemBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }
  const { textFallback, language_code: requestedLanguage, city } = body.data;

  let transcript = "";
  let detectedLanguage = requestedLanguage;

  if (req.file && req.file.buffer.length > 0) {
    console.log(
      `[SARVAM] STT request: ${req.file.mimetype}, ${(req.file.buffer.length / 1024).toFixed(0)}KB, language_code=${requestedLanguage}`,
    );
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
      // Network failure / timeout reaching Sarvam: log it and keep the text fallback usable.
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error("[SARVAM] STT request did not complete:", reason);
      res.status(502).json({ error: `Speech-to-text unavailable (${reason}). Try the text box or a sample chip.` });
      return;
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
  if (!listing) {
    res.status(422).json({
      error: `Heard "${transcript}" but no product and price. Try: item name, quantity and price, e.g. "Kaju katli 1 kilo 650 rupaye".`,
      transcript,
      detectedLanguage,
    });
    return;
  }
  const item: Item = { id: nextItemId(), ...listing, city, sellerLanguage };

  const photo = decodePhoto((req.body as Record<string, unknown> | undefined)?.imageUrl);
  if (photo) {
    try {
      mkdirSync(PHOTOS_DIR, { recursive: true });
      const photoFile = `${item.id}.${photo.ext}`;
      writeFileSync(path.join(PHOTOS_DIR, photoFile), photo.buffer);
      item.photoFile = photoFile;
      item.imageUrl = `/api/items/${item.id}/photo`;
    } catch (error) {
      console.error("[ITEMS] could not save seller photo (listing kept without it):", error);
    }
  }
  addItem(item);
  appendOpsLog("INFO", `New listing "${item.title}" at ₹${item.askPrice} in ${city} (${sellerLanguage}, via ${source})`);

  // Seller's own preview: includes floorPrice so Tab 1 can mark it "Hidden from Buyer".
  const { photoFile: _photoFile, ...sellerView } = item;
  void _photoFile;
  const response: CreateVoiceItemResponse = {
    transcript,
    detectedLanguage,
    item: { ...sellerView, imageUrl: absoluteUrl(req, item.imageUrl) },
  };
  res.status(201).json(response);
});

export default itemsRouter;
