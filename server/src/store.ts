import { computeFairPrice } from "./pricing.js";
import type {
  ExperimentStats,
  HagglingPersona,
  Item,
  OpsLogEntry,
  PublicItemView,
} from "./types.js";

const items: Item[] = [
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

export const experimentStats: ExperimentStats = {
  polite_aunty: { sessions: 0, dealsClosed: 0, totalRevenue: 0 },
  savage_local: { sessions: 0, dealsClosed: 0, totalRevenue: 0 },
};

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

export function addItem(item: Item): Item {
  items.unshift(item);
  return item;
}

export function toPublicItemView(
  item: Item,
  cityMultiplier: number
): PublicItemView {
  const { adjustedBenchmark, markupPct, fairPriceStatus } = computeFairPrice(
    item.askPrice,
    item.benchmarkPrice,
    cityMultiplier
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

export function lockDeal(
  itemId: string,
  finalPrice: number,
  personaUsed: HagglingPersona
): LockDealOutcome {
  const item = items.find((entry) => entry.id === itemId);
  if (!item) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (item.stock <= 0) {
    return { ok: false, reason: "OUT_OF_STOCK" };
  }

  // Synchronous atomic update with zero awaits between check and mutation
  item.stock -= 1;
  experimentStats[personaUsed].dealsClosed += 1;
  experimentStats[personaUsed].totalRevenue += Math.round(finalPrice);

  return {
    ok: true,
    item,
    remainingStock: item.stock,
  };
}

export function appendOpsLog(
  stage: OpsLogEntry["stage"],
  message: string
): OpsLogEntry {
  const entry: OpsLogEntry = {
    timestamp: new Date().toISOString(),
    stage,
    message,
  };
  opsLog.unshift(entry);
  if (opsLog.length > 50) {
    opsLog.length = 50;
  }
  return entry;
}
