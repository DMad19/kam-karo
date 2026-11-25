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
  imageUrl?: string;
}

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
  imageUrl?: string;
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

export interface LockDealRequest {
  itemId: string;
  finalPrice: number;
  personaUsed: HagglingPersona;
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

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  code: SupportedLanguage;
  label: string;
  shortLabel: string;
}> = [
  { code: "hi-IN", label: "Hindi (hi-IN)", shortLabel: "Hindi" },
  { code: "kn-IN", label: "Kannada (kn-IN)", shortLabel: "Kannada" },
  { code: "te-IN", label: "Telugu (te-IN)", shortLabel: "Telugu" },
  { code: "ta-IN", label: "Tamil (ta-IN)", shortLabel: "Tamil" },
  { code: "en-IN", label: "English (en-IN)", shortLabel: "English" },
  { code: "unknown", label: "Auto-Detect", shortLabel: "Auto" },
];

export const CITY_OPTIONS: ReadonlyArray<CityName> = [
  "Bengaluru",
  "Hyderabad",
  "Delhi",
];

export function formatLanguageName(code: string): string {
  const match = LANGUAGE_OPTIONS.find((opt) => opt.code === code);
  if (match) {
    return `${match.shortLabel} (${match.code})`;
  }
  return code;
}
