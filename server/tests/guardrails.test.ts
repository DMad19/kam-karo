// Offline guardrail tests — no network, zero sponsor API credits. Run: npx tsx tests/guardrails.test.ts
import assert from "node:assert/strict";
import { clampCounterOffer, computeFairPrice } from "../src/pricing.js";
import {
  experimentStats,
  getItemById,
  getItems,
  lockDeal,
  nextItemId,
  resetStore,
  toPublicItemView,
} from "../src/store.js";
import {
  extractJsonObject,
  fallbackListing,
  normalizeCategory,
} from "../src/services/sarvamSellerService.js";
import { buildDiwaliSurgePayload } from "../src/services/nudgebeeService.js";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log("Kam Karo guardrails");

test("Fair-Price thresholds: GREEN <= 10%, YELLOW <= 25%, RED above", () => {
  assert.equal(computeFairPrice(110, 100, 1).fairPriceStatus, "GREEN");
  assert.equal(computeFairPrice(111, 100, 1).fairPriceStatus, "YELLOW");
  assert.equal(computeFairPrice(125, 100, 1).fairPriceStatus, "YELLOW");
  assert.equal(computeFairPrice(126, 100, 1).fairPriceStatus, "RED");
  assert.equal(computeFairPrice(90, 100, 1).fairPriceStatus, "GREEN");
});

test("Fair-Price applies city multiplier (Kaju Katli: ₹650 vs ₹500 x BLR 1.15)", () => {
  const blr = computeFairPrice(650, 500, 1.15);
  assert.equal(blr.adjustedBenchmark, 575);
  assert.equal(blr.markupPct, 13);
  assert.equal(blr.fairPriceStatus, "YELLOW");
  const standard = computeFairPrice(650, 500, 1.0);
  assert.equal(standard.markupPct, 30);
  assert.equal(standard.fairPriceStatus, "RED");
});

test("Fair-Price survives NaN / zero / negative multiplier inputs", () => {
  const result = computeFairPrice(Number.NaN, 0, -2);
  assert.ok(Number.isFinite(result.adjustedBenchmark));
  assert.ok(Number.isFinite(result.markupPct));
});

test("Floor clamp: ₹1, -100, NaN, ±Infinity all clamp to floorPrice (₹550)", () => {
  assert.equal(clampCounterOffer(1, 550, 650), 550);
  assert.equal(clampCounterOffer(-100, 550, 650), 550);
  assert.equal(clampCounterOffer(Number.NaN, 550, 650), 550);
  assert.equal(clampCounterOffer(Number.NEGATIVE_INFINITY, 550, 650), 550);
  assert.equal(clampCounterOffer(Number.POSITIVE_INFINITY, 550, 650), 550);
});

test("Ceiling clamp: above askPrice -> askPrice; in-range offers are rounded", () => {
  assert.equal(clampCounterOffer(5000, 550, 650), 650);
  assert.equal(clampCounterOffer(600.6, 550, 650), 601);
});

test("lockDeal is atomic, updates A/B stats, and refuses out-of-stock", () => {
  resetStore();
  const hamper = getItemById("item_03");
  assert.ok(hamper);
  const startingStock = hamper.stock;
  for (let i = 0; i < startingStock; i += 1) {
    assert.equal(lockDeal(hamper.id, 1000, "savage_local").ok, true);
  }
  assert.equal(hamper.stock, 0);
  assert.equal(experimentStats.savage_local.dealsClosed, startingStock);
  assert.equal(experimentStats.savage_local.totalRevenue, startingStock * 1000);
  assert.deepEqual(lockDeal(hamper.id, 1000, "savage_local"), { ok: false, reason: "OUT_OF_STOCK" });
  assert.equal(hamper.stock, 0);
  assert.equal(experimentStats.savage_local.dealsClosed, startingStock);
  assert.deepEqual(lockDeal("item_99", 1000, "polite_aunty"), { ok: false, reason: "NOT_FOUND" });
  resetStore();
});

test("Zero floorPrice leakage in public item views", () => {
  resetStore();
  const items = getItems();
  assert.equal(items.length, 3);
  for (const item of items) {
    const view = toPublicItemView(item, 1.15);
    assert.equal("floorPrice" in view, false);
    const serialized = JSON.stringify(view);
    assert.equal(serialized.includes("floorPrice"), false);
    assert.equal(serialized.includes(String(item.floorPrice)), false);
  }
});

test("New listings get sequential ids after the seeds", () => {
  resetStore();
  assert.equal(nextItemId(), "item_04");
});

test("Seller JSON extraction strips fences and <think> blocks", () => {
  const raw = '<think>hmm</think>```json\n{"title":"Kaju Katli","askPrice":650}\n```';
  assert.equal(extractJsonObject(raw), '{"title":"Kaju Katli","askPrice":650}');
  assert.equal(extractJsonObject("no json here"), null);
});

test("Seller fallback: floor 85% of ask, benchmark 80%, valid category", () => {
  const listing = fallbackListing("Kaju katli 1 kilo, 1,200 rupees");
  assert.equal(listing.askPrice, 1200);
  assert.equal(listing.floorPrice, 1020);
  assert.equal(listing.benchmarkPrice, 960);
  assert.equal(listing.stock, 10);
  assert.equal(listing.category, "sweets");
  assert.equal(normalizeCategory("Gift Hampers", "x"), "hampers");
  assert.equal(normalizeCategory(undefined, "Terracotta diya set"), "decor");
});

test("NudgeBee diwali_surge payload matches the TDD contract exactly", () => {
  assert.deepEqual(buildDiwaliSurgePayload("Bengaluru", "item_03", 3), {
    event: "diwali_surge",
    service: "kam-karo-bazaar",
    city: "Bengaluru",
    item_id: "item_03",
    stock_remaining: 3,
    tts_p95_latency_ms: 4300,
    error_rate: 0.19,
    recommended_action: "enable_surge_lite_mode",
  });
});

console.log(`PASS — ${passed} guardrail tests`);
