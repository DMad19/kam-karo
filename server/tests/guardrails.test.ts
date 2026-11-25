// Offline guardrail tests — no network, no sponsor calls. Run: npx tsx tests/guardrails.test.ts
import assert from "node:assert/strict";
import { clampCounterOffer, computeFairPrice } from "../src/pricing.js";
import { getItem, listItems, lockDeal, resetStore, toPublicItemView } from "../src/store.js";
import { extractJsonObject, fallbackListing } from "../src/services/sarvamSellerService.js";

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

test("Fair-Price thresholds: fair / stretch / overpriced", () => {
  assert.equal(computeFairPrice(110, 100, 1).verdict, "fair");
  assert.equal(computeFairPrice(111, 100, 1).verdict, "stretch");
  assert.equal(computeFairPrice(125, 100, 1).verdict, "stretch");
  assert.equal(computeFairPrice(126, 100, 1).verdict, "overpriced");
  assert.equal(computeFairPrice(90, 100, 1).verdict, "fair");
});

test("Fair-Price applies city multiplier (BLR 1.15)", () => {
  const result = computeFairPrice(900, 720, 1.15);
  assert.equal(result.adjustedBenchmark, 828);
  assert.equal(result.markupPct, 8.7);
  assert.equal(result.verdict, "fair");
});

test("Fair-Price survives NaN / zero inputs", () => {
  const result = computeFairPrice(Number.NaN, 0, Number.NaN);
  assert.equal(result.markupPct, 0);
  assert.ok(Number.isFinite(result.adjustedBenchmark));
});

test("Floor clamp: ₹1, -100, NaN, Infinity all clamp to floorPrice", () => {
  assert.equal(clampCounterOffer(1, 550, 900), 550);
  assert.equal(clampCounterOffer(-100, 550, 900), 550);
  assert.equal(clampCounterOffer(Number.NaN, 550, 900), 550);
  assert.equal(clampCounterOffer(Number.NEGATIVE_INFINITY, 550, 900), 550);
  assert.equal(clampCounterOffer(Number.POSITIVE_INFINITY, 550, 900), 550);
});

test("Ceiling clamp: offers above askPrice clamp to askPrice; in-range offers are rounded", () => {
  assert.equal(clampCounterOffer(5000, 550, 900), 900);
  assert.equal(clampCounterOffer(700.6, 550, 900), 701);
});

test("lockDeal is atomic and refuses out-of-stock", () => {
  resetStore();
  const item = getItem("item_dry_fruit_hamper");
  assert.ok(item);
  const startingStock = item.stock;
  for (let i = 0; i < startingStock; i += 1) assert.equal(lockDeal(item.id).ok, true);
  assert.equal(item.stock, 0);
  assert.deepEqual(lockDeal(item.id), { ok: false, reason: "out_of_stock" });
  assert.equal(item.stock, 0);
  assert.deepEqual(lockDeal("does_not_exist"), { ok: false, reason: "not_found" });
  resetStore();
});

test("Zero floorPrice leakage in public item views", () => {
  resetStore();
  const items = listItems();
  assert.equal(items.length, 3);
  for (const item of items) {
    const view = toPublicItemView(item, 1.15);
    assert.equal("floorPrice" in view, false);
    const serialized = JSON.stringify(view);
    assert.equal(serialized.includes("floorPrice"), false);
    assert.equal(serialized.includes(`:${item.floorPrice},`), false);
  }
});

test("Seller JSON extraction strips fences and <think> blocks", () => {
  const raw = '<think>hmm</think>```json\n{"title":"Kaju Katli","askPrice":900}\n```';
  assert.equal(extractJsonObject(raw), '{"title":"Kaju Katli","askPrice":900}');
  assert.equal(extractJsonObject("no json here"), null);
});

test("Seller fallback keeps floor below ask", () => {
  const listing = fallbackListing("Kaju katli 1 kilo, 1,200 rupees");
  assert.equal(listing.askPrice, 1200);
  assert.ok(listing.floorPrice <= listing.askPrice);
});

console.log(`PASS — ${passed} guardrail tests`);
