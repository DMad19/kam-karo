// In-memory Diwali bazaar store (zero DB server). Single Node process => synchronous ops are atomic.
import { computeFairPrice, type FairPriceResult } from "./pricing.js";

export type Persona = "polite_aunty" | "savage_local";
export type LanguageCode = "hi-IN" | "kn-IN" | "te-IN" | "ta-IN" | "en-IN";

export const SUPPORTED_LANGUAGES: readonly LanguageCode[] = ["hi-IN", "kn-IN", "te-IN", "ta-IN", "en-IN"];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Full server-side item. `floorPrice` NEVER leaves the server via buyer routes. */
export interface Item {
  id: string;
  title: string;
  category: string;
  askPrice: number;
  floorPrice: number;
  benchmarkPrice: number;
  stock: number;
  sellerLanguage: LanguageCode;
  createdAt: string;
}

/** Buyer-safe projection returned by GET /api/items. */
export interface PublicItemView {
  id: string;
  title: string;
  category: string;
  askPrice: number;
  benchmarkPrice: number;
  stock: number;
  sellerLanguage: LanguageCode;
  fairPrice: FairPriceResult & { cityMultiplier: number };
}

export interface PersonaStats {
  sessions: number;
  dealsClosed: number;
  totalRevenue: number;
}

export type OpsLogType = "ALERT_SENT" | "AWAITING_APPROVAL" | "SELF_HEALED" | "DEAL_LOCKED" | "ITEM_LISTED" | "ERROR";

export interface OpsLogEntry {
  timestamp: string;
  type: OpsLogType;
  message: string;
}

export type LockDealResult =
  | { ok: true; item: Item }
  | { ok: false; reason: "not_found" | "out_of_stock" };

const SEED_ITEMS: readonly Item[] = [
  {
    id: "item_kaju_katli",
    title: "Kaju Katli (1 kg Diwali Box)",
    category: "Sweets",
    askPrice: 900,
    floorPrice: 550,
    benchmarkPrice: 720,
    stock: 12,
    sellerLanguage: "hi-IN",
    createdAt: "2026-11-25T05:00:00.000Z",
  },
  {
    id: "item_terracotta_diyas",
    title: "Hand-painted Terracotta Diyas (Set of 12)",
    category: "Diyas & Decor",
    askPrice: 480,
    floorPrice: 300,
    benchmarkPrice: 380,
    stock: 25,
    sellerLanguage: "kn-IN",
    createdAt: "2026-11-25T05:00:00.000Z",
  },
  {
    id: "item_dry_fruit_hamper",
    title: "Premium Dry-Fruit Diwali Hamper",
    category: "Gift Hampers",
    askPrice: 1800,
    floorPrice: 1350,
    benchmarkPrice: 1500,
    stock: 8,
    sellerLanguage: "te-IN",
    createdAt: "2026-11-25T05:00:00.000Z",
  },
];

const items = new Map<string, Item>(SEED_ITEMS.map((item) => [item.id, { ...item }]));

export const experimentStats: Record<Persona, PersonaStats> = {
  polite_aunty: { sessions: 0, dealsClosed: 0, totalRevenue: 0 },
  savage_local: { sessions: 0, dealsClosed: 0, totalRevenue: 0 },
};

export const opsLog: OpsLogEntry[] = [];
const OPS_LOG_LIMIT = 200;

export function appendOpsLog(type: OpsLogType, message: string): OpsLogEntry {
  const entry: OpsLogEntry = { timestamp: new Date().toISOString(), type, message };
  opsLog.push(entry);
  if (opsLog.length > OPS_LOG_LIMIT) opsLog.splice(0, opsLog.length - OPS_LOG_LIMIT);
  return entry;
}

export function listItems(): Item[] {
  return [...items.values()];
}

export function getItem(id: string): Item | undefined {
  return items.get(id);
}

export type NewItemInput = Omit<Item, "id" | "createdAt">;

export function addItem(input: NewItemInput): Item {
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  const id = `item_${slug || "listing"}_${Date.now().toString(36)}`;
  const item: Item = { ...input, id, createdAt: new Date().toISOString() };
  items.set(id, item);
  return item;
}

/**
 * Atomically decrements stock by 1. Fully synchronous (no await between
 * check and write), so concurrent requests can never oversell.
 */
export function lockDeal(itemId: string): LockDealResult {
  const item = items.get(itemId);
  if (!item) return { ok: false, reason: "not_found" };
  if (item.stock <= 0) return { ok: false, reason: "out_of_stock" };
  item.stock -= 1;
  return { ok: true, item };
}

/** Buyer-safe view. Explicitly whitelists fields so floorPrice can never leak. */
export function toPublicItemView(item: Item, cityMultiplier = 1): PublicItemView {
  const fair = computeFairPrice(item.askPrice, item.benchmarkPrice, cityMultiplier);
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    askPrice: item.askPrice,
    benchmarkPrice: item.benchmarkPrice,
    stock: item.stock,
    sellerLanguage: item.sellerLanguage,
    fairPrice: { ...fair, cityMultiplier },
  };
}

/** Test helper: restore the 3 seed items and zero all counters. */
export function resetStore(): void {
  items.clear();
  for (const item of SEED_ITEMS) items.set(item.id, { ...item });
  for (const stats of Object.values(experimentStats)) {
    stats.sessions = 0;
    stats.dealsClosed = 0;
    stats.totalRevenue = 0;
  }
  opsLog.length = 0;
}
