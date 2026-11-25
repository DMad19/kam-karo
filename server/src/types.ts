import { z } from "zod";

export type FairPriceStatus = "GREEN" | "YELLOW" | "RED";
export type CityName = "Bengaluru" | "Hyderabad" | "Delhi";
export type ItemCategory = "sweets" | "decor" | "hampers";
export type HagglingPersona = "polite_aunty" | "savage_local";
export type SupportedLanguage =
  | "unknown"
  | "hi-IN"
  | "kn-IN"
  | "te-IN"
  | "ta-IN"
  | "en-IN";

// Internal server-only model — NEVER serialize directly to buyer GET /api/items
export interface Item {
  id: string;
  title: string;
  category: ItemCategory;
  askPrice: number;
  floorPrice: number;
  benchmarkPrice: number;
  stock: number;
  city: CityName;
  sellerLanguage: string;
}

// Buyer-safe projection returned by GET /api/items
export interface PublicItemView {
  id: string;
  title: string;
  category: ItemCategory;
  askPrice: number;
  adjustedBenchmark: number;
  markupPct: number;
  fairPriceStatus: FairPriceStatus;
  stock: number;
  city: CityName;
  sellerLanguage: string;
}

export interface HaggleResponse {
  buyerTranscript: string;
  detectedLanguage: string;
  sellerLanguage: string;
  crossLingualBridge: boolean;
  personaUsed: HagglingPersona;
  shopkeeperReplyText: string;
  counterOfferPrice: number;
  dealAccepted: boolean;
  fairPriceStatus: FairPriceStatus;
  markupPct: number;
  audioBase64: string | null;
  surgeLiteMode: boolean;
}

export interface PersonaMetric {
  sessions: number;
  dealsClosed: number;
  totalRevenue: number;
}

export interface ExperimentStats {
  polite_aunty: PersonaMetric;
  savage_local: PersonaMetric;
}

export interface OpsLogEntry {
  timestamp: string;
  stage: "ALERT_SENT" | "AWAITING_APPROVAL" | "SELF_HEALED" | "INFO";
  message: string;
}

export interface CityFairPriceConfig {
  multiplier: number;
  label: string;
}

export interface HealthResponse {
  status: "ok";
  port: number;
}

export interface GetItemsResponse {
  items: PublicItemView[];
  cityMultiplier: number;
  cityLabel: string;
}

export interface CreateVoiceItemResponse {
  transcript: string;
  detectedLanguage: string;
  item: Item;
}

export interface LockDealResponse {
  itemId: string;
  remainingStock: number;
  sellerLanguage: string;
  notificationNote: string;
  experimentStats: ExperimentStats;
}

export interface GetFlagsResponse {
  haggling_persona: HagglingPersona;
  surge_lite_mode: boolean;
  city_fair_price_config: CityFairPriceConfig;
  experimentStats: ExperimentStats;
  opsLog: OpsLogEntry[];
}

export interface DiwaliSurgePayload {
  event: "diwali_surge";
  service: "kam-karo-bazaar";
  city: CityName;
  item_id: string;
  stock_remaining: number;
  tts_p95_latency_ms: number;
  error_rate: number;
  recommended_action: "enable_surge_lite_mode";
}

export interface SimulateSurgeResponse {
  status: "alert_sent";
  webhookStatusCode: number;
  payload: DiwaliSurgePayload;
}

// Zod 4 schemas for all 6 API routes and LLM structured extraction
export const CityNameSchema = z.enum(["Bengaluru", "Hyderabad", "Delhi"]);
export const ItemCategorySchema = z.enum(["sweets", "decor", "hampers"]);
export const HagglingPersonaSchema = z.enum(["polite_aunty", "savage_local"]);
export const SupportedLanguageSchema = z.enum([
  "unknown",
  "hi-IN",
  "kn-IN",
  "te-IN",
  "ta-IN",
  "en-IN",
]);

export const GetItemsQuerySchema = z.object({
  city: CityNameSchema.default("Bengaluru"),
});

export const CreateVoiceItemBodySchema = z.object({
  textFallback: z.string().trim().optional(),
  language_code: z.string().trim().min(1).default("unknown"),
  city: CityNameSchema.default("Bengaluru"),
});

export const HaggleBodySchema = z.object({
  itemId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  city: CityNameSchema.default("Bengaluru"),
  language_code: z.string().trim().min(1).default("unknown"),
  textFallback: z.string().trim().optional(),
});

export const LockDealBodySchema = z.object({
  itemId: z.string().trim().min(1),
  finalPrice: z.number().finite().positive(),
  personaUsed: HagglingPersonaSchema,
});

export const GetFlagsQuerySchema = z.object({
  sessionId: z.string().trim().min(1).default("buyer_42"),
  city: CityNameSchema.default("Bengaluru"),
});

export const SimulateSurgeBodySchema = z.object({
  itemId: z.string().trim().min(1),
  city: CityNameSchema.default("Bengaluru"),
});

export const SellerExtractionSchema = z.object({
  title: z.string().trim().min(1),
  category: ItemCategorySchema,
  askPrice: z.number().finite().positive(),
  floorPrice: z.number().finite().positive(),
  benchmarkPrice: z.number().finite().positive(),
  stock: z.number().int().positive(),
});

export const HaggleLlmOutputSchema = z.object({
  counterOfferPrice: z.number().finite(),
  dealAccepted: z.boolean(),
  replyText: z.string().trim().min(1),
});
