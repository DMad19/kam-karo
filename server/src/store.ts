// In-memory Diwali bazaar store (zero DB server). Single Node event loop => synchronous ops are atomic.
import { computeFairPrice } from "./pricing.js";
import type { ExperimentStats, HagglingPersona, Item, OpsLogEntry, PublicItemView } from "./types.js";

const SEED_ITEMS: readonly Item[] = [
  {
    id: "item_01",
    title: "Homemade Pure Ghee Kaju Katli (1 kg)",
    category: "sweets",
    askPrice: 650,
    floorPrice: 550,
    benchmarkPrice: 500,
    stock: 5,
    city: "Bengaluru",
    sellerLanguage: "hi-IN",
  },
  {
    id: "item_02",
    title: "Hand-Painted Terracotta Diyas (Set of 24)",
    category: "decor",
    askPrice: 320,
    floorPrice: 240,
    benchmarkPrice: 210,
    stock: 12,
    city: "Bengaluru",
    sellerLanguage: "kn-IN",
  },
  {
    id: "item_03",
    title: "Royal Dry-Fruit Diwali Gift Hamper",
    category: "hampers",
    askPrice: 1250,
    floorPrice: 980,
    benchmarkPrice: 920,
    stock: 3,
    city: "Hyderabad",
    sellerLanguage: "te-IN",
  },
];

const items: Item[] = SEED_ITEMS.map((item) => ({ ...item }));

export const experimentStats: ExperimentStats = {
  polite_aunty: { sessions: 0, dealsClosed: 0, totalRevenue: 0 },
  savage_local: { sessions: 0, dealsClosed: 0, totalRevenue: 0 },
};

const OPS_LOG_LIMIT = 50;

export const opsLog: OpsLogEntry[] = [
  {
    timestamp: new Date().toISOString(),
    stage: "INFO",
    message: "Kam Karo Diwali bazaar store initialized with 3 pre-seeded items.",
  },
];

export function getItems(): Item[] {
  return items;
}

export function getItemById(itemId: string): Item | undefined {
  return items.find((item) => item.id === itemId);
}

/** Next sequential id after the seeds: item_04, item_05, ... */
export function nextItemId(): string {
  const maxSeq = items.reduce((max, item) => {
    const match = /^item_(\d+)$/.exec(item.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `item_${String(maxSeq + 1).padStart(2, "0")}`;
}

/** Newest listings first so Tab 1's inventory grid shows the fresh item on top. */
export function addItem(item: Item): Item {
  items.unshift(item);
  return item;
}

/** Buyer-safe view. Explicitly whitelists fields so floorPrice can never leak. */
export function toPublicItemView(item: Item, cityMultiplier: number): PublicItemView {
  const { adjustedBenchmark, markupPct, fairPriceStatus } = computeFairPrice(
    item.askPrice,
    item.benchmarkPrice,
    cityMultiplier,
  );

  return {
    id: item.id,
    title: item.title,
    category: item.category,
    askPrice: item.askPrice,
    adjustedBenchmark,
    markupPct,
    fairPriceStatus,
    stock: item.stock,
    city: item.city,
    sellerLanguage: item.sellerLanguage,
  };
}

export type LockDealOutcome =
  | { ok: true; item: Item; remainingStock: number }
  | { ok: false; reason: "NOT_FOUND" | "OUT_OF_STOCK" };

/**
 * Stock check, decrement and A/B stats update run synchronously with
 * zero awaits in between, so concurrent requests can never oversell.
 */
export function lockDeal(itemId: string, finalPrice: number, personaUsed: HagglingPersona): LockDealOutcome {
  const item = items.find((entry) => entry.id === itemId);
  if (!item) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (item.stock <= 0) {
    return { ok: false, reason: "OUT_OF_STOCK" };
  }

  item.stock -= 1;
  experimentStats[personaUsed].dealsClosed += 1;
  experimentStats[personaUsed].totalRevenue += Math.round(finalPrice);

  return { ok: true, item, remainingStock: item.stock };
}

/** Newest entries first, capped at 50. */
export function appendOpsLog(stage: OpsLogEntry["stage"], message: string): OpsLogEntry {
  const entry: OpsLogEntry = { timestamp: new Date().toISOString(), stage, message };
  opsLog.unshift(entry);
  if (opsLog.length > OPS_LOG_LIMIT) {
    opsLog.length = OPS_LOG_LIMIT;
  }
  return entry;
}

/** Test helper: restore the 3 seed items and zero all counters. */
export function resetStore(): void {
  items.splice(0, items.length, ...SEED_ITEMS.map((item) => ({ ...item })));
  for (const stats of Object.values(experimentStats)) {
    stats.sessions = 0;
    stats.dealsClosed = 0;
    stats.totalRevenue = 0;
  }
  opsLog.length = 0;
}
