import assert from "node:assert/strict";
import test from "node:test";
import { capBuy, quoteBuy, quoteSell } from "../lib/curve.ts";
import { parseUnits } from "../lib/format.ts";
import { validateLinkedBlock, chooseCanonical, selectHeavier } from "../lib/fork.ts";
import { vestedAmount } from "../lib/vesting.ts";

const Z = 10n ** 18n;
const T = 10n ** 6n;

test("buys raise the price and sells return less than you put in", () => {
  const side = { z: 30n * Z, tokens: 1_073_000_000n * T, k: 30n * Z * 1_073_000_000n * T };
  const buy = quoteBuy(side, 2n * Z, 100n, 30n);
  assert.ok(buy.tokens > 0n);
  assert.ok(buy.priceAfter > buy.priceBefore);
  assert.equal(buy.fee, buy.creatorFee + buy.protocolFee);
  const after = { z: buy.newZ, tokens: buy.newTokens, k: side.k };
  const sell = quoteSell(after, buy.tokens, 100n, 30n);
  assert.ok(sell.proceeds < 2n * Z);
});

test("a buy cannot take more tokens than the sale inventory", () => {
  const side = { z: 30n * Z, tokens: 1_000n * T, k: 30n * Z * 1_000n * T };
  const capped = capBuy(side, 100n * Z, 10n * T, 100n, 30n);
  assert.equal(capped.capped, true);
  assert.ok(capped.quote.tokens <= 10n * T);
});

test("vesting stays dark through the cliff and unlocks yearly", () => {
  const total = parseUnits("150000000", 18);
  const start = Date.UTC(2025, 5, 1);
  assert.equal(vestedAmount(total, start, start + 100 * 86400000, 120, 4, 2500), 0n);
  assert.equal(vestedAmount(total, start, start + 200 * 86400000, 120, 4, 2500), 0n);
  assert.equal(vestedAmount(total, start, start + 365 * 86400000, 120, 4, 2500), total / 4n);
  assert.equal(vestedAmount(total, start, start + 365 * 4 * 86400000, 120, 4, 2500), total);
});

test("fork choice keeps the longer valid tip and rejects a bad header", () => {
  assert.equal(chooseCanonical(12, 9).keep, "local");
  assert.equal(chooseCanonical(4, 9).keep, "remote");
  assert.equal(chooseCanonical(1.5, 1).valid, false);
  const reason = validateLinkedBlock(
    { height: 3, parent: "0x" + "ab".repeat(32), at: 10, hash: "0x" + "11".repeat(32) },
    { height: 1, hash: "0x" + "ab".repeat(32), at: 5 },
  );
  assert.equal(reason, "malformed height");
  const genesis = { height: 0, hash: "aa", parent: "00" };
  const local = [genesis, { height: 1, hash: "b1", parent: "aa" }, { height: 2, hash: "b2", parent: "b1" }];
  const longer = [genesis, { height: 1, hash: "c1", parent: "aa" }, { height: 2, hash: "c2", parent: "c1" }, { height: 3, hash: "c3", parent: "c2" }];
  assert.equal(selectHeavier(local, longer, 2).keep, "remote");
  const deep = [genesis, { height: 1, hash: "d1", parent: "aa" }, { height: 2, hash: "d2", parent: "d1" }, { height: 3, hash: "d3", parent: "d2" }, { height: 4, hash: "d4", parent: "d3" }];
  const pastFinality = [
    genesis,
    { height: 1, hash: "e1", parent: "aa" },
    { height: 2, hash: "e2", parent: "e1" },
    { height: 3, hash: "e3", parent: "e2" },
    { height: 4, hash: "e4", parent: "e3" },
    { height: 5, hash: "e5", parent: "e4" },
  ];
  const rejected = selectHeavier(deep, pastFinality, 2);
  assert.equal(rejected.keep, "local");
  assert.match(rejected.reason, /finalized/);
});
