// Offline guardrail tests — no network, zero sponsor API credits. Run: npx tsx tests/guardrails.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { clampCounterOffer, computeFairPrice } from "../src/pricing.js";
import {
  experimentStats,
  getItemById,
  getItems,
  lockDeal,
  nextItemId,
  resetStore,
  addItem,
  enableStorePersistence,
  toPublicItemView,
} from "../src/store.js";
import {
  extractJsonObject,
  fallbackListing,
  findAskPrice,
  priceIsInTranscript,
  findStatedFloor,
  findStatedStock,
  normalizeCategory,
} from "../src/services/sarvamSellerService.js";
import { buildDiwaliSurgePayload } from "../src/services/nudgebeeService.js";
import { decideCounterOffer, findBuyerOffer } from "../src/negotiation.js";
import { buyerLineValid, parseHaggleLines, replyMatchesPrice, toAsciiDigits } from "../src/services/sarvamHaggleService.js";

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
  assert.ok(listing);
  assert.equal(listing.askPrice, 1200);
  assert.equal(listing.floorPrice, 1020);
  assert.equal(listing.benchmarkPrice, 960);
  assert.equal(listing.stock, 10);
  assert.equal(listing.category, "sweets");
  assert.equal(normalizeCategory("Gift Hampers", "x"), "hampers");
  assert.equal(normalizeCategory(undefined, "Terracotta diya set"), "decor");
});

test("Seller fallback never invents a price (stray 'हाँ।' -> no listing)", () => {
  assert.equal(fallbackListing("हाँ।"), null);
  assert.equal(fallbackListing(""), null);
});

test("Seller quantities are never read as a price ('Kaju katli 1 kilo' -> no listing, not ₹1)", () => {
  assert.equal(fallbackListing("Kaju katli 1 kilo"), null);
  assert.equal(fallbackListing("Diya set of 12, 5 boxes hain"), null);
  assert.equal(fallbackListing("ಮಣ್ಣಿನ ದೀಪ 1 ಸೆಟ್"), null);
  assert.equal(findAskPrice("Kaju katli 1 kilo 650 rupaye"), 650);
  assert.equal(findAskPrice("1 kg kaju katli ₹650, minimum 550, 5 dabbe"), 650);
  assert.equal(findAskPrice("Diya set of 24, 320"), 320);
  assert.equal(findAskPrice("Gift hamper ₹1,250"), 1250);
  assert.equal(findAskPrice("ದೀಪ 12 ಸೆಟ್ 300 ರೂಪಾಯಿ"), 300);
  // LLM-invented prices are rejected unless the seller actually said a price
  assert.equal(priceIsInTranscript(600, "palgova 1 kg."), false);
  assert.equal(priceIsInTranscript(1250, "Gift hamper 1,250"), true);
  assert.equal(priceIsInTranscript(650, "kaju katli chhe sau pachaas rupaye"), true);
});

test("Seller's stated minimum and stock beat the model ('minimum 1100, 3 pieces')", () => {
  assert.equal(findStatedFloor("Gift hamper 1,250 rupees, minimum 1100, 3 pieces"), 1100);
  assert.equal(findStatedFloor("kaju katli 650, kam se kam 550"), 550);
  assert.equal(findStatedFloor("kaju katli 650"), null);
  assert.equal(findStatedStock("Gift hamper 1,250 rupees, minimum 1100, 3 pieces"), 3);
  assert.equal(findStatedStock("laddoo 400, 5 dabbe hain"), 5);
  assert.equal(findStatedStock("Diya set of 24, 320"), null);
  const fb = fallbackListing("1 kg kaju katli ₹650, minimum 550, 5 dabbe");
  assert.equal(fb?.askPrice, 650);
  assert.equal(fb?.floorPrice, 550);
  assert.equal(fb?.stock, 5);
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

test("Negotiation never breaks floor/ask and never goes back up (fuzz)", () => {
  for (let i = 0; i < 1000; i++) {
    const ask = 100 + Math.floor(Math.random() * 2000);
    const floor = Math.floor(ask * (0.5 + Math.random() * 0.5));
    const prev = Math.random() < 0.5 ? null : floor + Math.floor(Math.random() * (ask - floor + 1));
    const offers = [null, 1, -50, 0, Math.floor(Math.random() * ask * 1.5)];
    const raw = offers[i % offers.length]!;
    const d = decideCounterOffer({ askPrice: ask, floorPrice: floor, previousOffer: prev, buyerOffer: raw && raw > 0 ? raw : null, round: 1 + (i % 4) });
    assert.ok(d.price >= floor && d.price <= ask, `₹${d.price} outside [${floor}, ${ask}]`);
    if (prev !== null) assert.ok(d.price <= prev, `went back up: ${prev} -> ${d.price}`);
    assert.equal(Number.isInteger(d.price), true);
  }
});

test("Neutral shopkeeper: steps toward the buyer, accepts fair offers, holds at the floor", () => {
  const base = { askPrice: 650, floorPrice: 550, previousOffer: null, round: 1 };
  const first = decideCounterOffer({ ...base, buyerOffer: 500 });
  assert.equal(first.move, "counter");
  assert.ok(first.price < 650 && first.price > 550, `₹${first.price}`);
  assert.equal(decideCounterOffer({ ...base, buyerOffer: null }).move, "counter"); // small goodwill discount
  assert.deepEqual(decideCounterOffer({ ...base, previousOffer: 600, buyerOffer: 590 }).move, "accept"); // within 2% of ask
  assert.equal(decideCounterOffer({ ...base, previousOffer: 600, buyerOffer: 560 }).move, "counter");
  assert.deepEqual(decideCounterOffer({ ...base, previousOffer: 550, buyerOffer: 400 }), { price: 550, move: "hold", buyerOffer: 400, lowball: true });
  // Offering more than the price only pays the price
  assert.equal(decideCounterOffer({ ...base, previousOffer: 600, buyerOffer: 700 }).price, 600);
});

test("Buyer persona line keeps the user's exact offer and invents no other price", () => {
  assert.equal(buyerLineValid("भैया, ₹650? लूट है! ₹500 बोलो, वरना आगे वाली दुकान.", 500, 650, "Kaju Katli"), true);
  assert.equal(buyerLineValid("Bhaiya, Diwali hai — ₹480 kar do na!", 500, 650, "Kaju Katli"), false); // changed the number
  assert.equal(buyerLineValid("Bhaiya, thoda discount do na!", 500, 650, "Kaju Katli"), false); // dropped the number
  assert.equal(buyerLineValid("Bhaiya, ₹600 kar do na", null, 650, "Kaju Katli"), false); // invented a price
  assert.equal(buyerLineValid("Bhaiya, thoda discount do na, Diwali hai!", null, 650, "Kaju Katli"), true);
  assert.equal(buyerLineValid("Set of 24 for ₹250 please", 250, 320, "Terracotta Diyas (Set of 24)"), true);
});

test("Model output parsing: BUYER/SHOP lines", () => {
  assert.deepEqual(parseHaggleLines('BUYER: "भैया ₹500 कर दो"\nSHOP: जी, ₹620 कर देता हूँ.'), { buyer: "भैया ₹500 कर दो", shop: "जी, ₹620 कर देता हूँ." });
  assert.deepEqual(parseHaggleLines("**Buyer:** Bhaiya ₹500!\n**Shopkeeper:** ₹620 ji"), { buyer: "Bhaiya ₹500!", shop: "₹620 ji" });
  assert.deepEqual(parseHaggleLines("random text"), { buyer: null, shop: null });
});

test("Buyer offer parsing: last price wins, quantities and ₹1-style noise ignored", () => {
  assert.equal(findBuyerOffer("650 bahut hai, 500 mein do"), 500);
  assert.equal(findBuyerOffer("1 kilo ke liye ₹520 dunga"), 520);
  assert.equal(findBuyerOffer("thoda discount do"), null);
  assert.equal(findBuyerOffer(toAsciiDigits("५०० में दो")), 500);
});

test("Shopkeeper reply must say exactly the counter-offer price", () => {
  assert.equal(replyMatchesPrice("बेटा, आपके लिए ₹590, एक diya free!", 590, 500, "Kaju Katli (1 kg)"), true);
  assert.equal(replyMatchesPrice("₹500? नहीं भैया, ₹615 last.", 615, 500, "Kaju Katli"), true);
  assert.equal(replyMatchesPrice("बेटा, ₹600 में ले लो", 590, 500, "Kaju Katli"), false);
  assert.equal(replyMatchesPrice("₹590 या ₹580, जो बोलो", 590, null, "Kaju Katli"), false);
  assert.equal(replyMatchesPrice("Set of 24 diyas, ₹280 final", 280, null, "Terracotta Diyas (Set of 24)"), true);
  assert.equal(replyMatchesPrice("बेटा, ₹५९० पक्का", 590, null, "Kaju Katli"), true);
  assert.equal(replyMatchesPrice("₹1 में? नहीं भैया, ₹650 final", 650, null, "Kaju Katli"), false);
});

// Runs last: switches the store to a temp JSON file (never the real server/data/store.json).
test("Store persists listings + stock to JSON and survives a reload", () => {
  resetStore();
  const file = path.join(mkdtempSync(path.join(tmpdir(), "kam-karo-")), "store.json");
  enableStorePersistence(file);
  addItem({ id: "item_99", title: "Persisted Palgova 1 kg", category: "sweets", askPrice: 480, floorPrice: 408,
    benchmarkPrice: 420, stock: 2, city: "Bengaluru", sellerLanguage: "ta-IN" });
  lockDeal("item_99", 450, "polite_aunty");
  const saved = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(saved.items[0].id, "item_99");
  assert.equal(saved.items[0].stock, 1);
  assert.equal(saved.experimentStats.polite_aunty.dealsClosed, 1);
  // Simulate a restart: wipe memory WITHOUT saving, then load from disk.
  getItems().splice(0);
  assert.equal(getItemById("item_99"), undefined);
  enableStorePersistence(file);
  assert.equal(getItemById("item_99")?.stock, 1);
  assert.equal(getItemById("item_99")?.floorPrice, 408);
  assert.equal(getItems().length, 4);
  resetStore();
});

console.log(`PASS — ${passed} guardrail tests`);
