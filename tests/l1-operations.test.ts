import assert from "node:assert/strict";
import test from "node:test";
import {
  CREATE_FEE_UNITS,
  SUPPLY_CAP_UNITS,
  ZERO_ADDRESS,
  buy,
  delegate,
  identityFromSeed,
  launchCreate,
  propose,
  sell,
  signTx,
  undelegate,
  unitsToZ,
  verifyL1Tx,
  vote,
  zToUnits,
} from "../lib/l1/index.ts";

const word = (hex: string) => hex.padStart(64, "0");

test("Z amounts round-trip through base units", () => {
  assert.equal(zToUnits("0.2"), CREATE_FEE_UNITS);
  assert.equal(zToUnits(1), 1_000_000_000_000_000_000n);
  assert.equal(zToUnits("2.5"), 2_500_000_000_000_000_000n);
  assert.equal(unitsToZ(SUPPLY_CAP_UNITS), "1000000000");
  assert.equal(unitsToZ(CREATE_FEE_UNITS), "0.2");
  assert.throws(() => zToUnits("1.1234567890123456789"));
});

test("a launch deploy carries the marker, the program, and the flat fee", () => {
  const tx = launchCreate("a1b2");
  assert.equal(tx.to, ZERO_ADDRESS);
  assert.equal(tx.amount, CREATE_FEE_UNITS);
  assert.equal(tx.data?.toString("hex"), "f0a1b2");
  assert.throws(() => launchCreate("xyz"));
});

test("the buy and sell calldata match the curve selector layout", () => {
  assert.equal(buy("aa".repeat(20), 5n).data?.toString("hex"), word("01"));
  const sold = sell("aa".repeat(20), 12n);
  assert.equal(sold.amount, 0n);
  assert.equal(sold.data?.toString("hex"), word("02") + word("0c"));
});

test("staking and governance operations match the node payloads", () => {
  assert.equal(delegate(7, 100n).data?.toString("hex"), "0100000007");
  assert.equal(undelegate(7, 100n).data?.toString("hex"), "0200000007");
  assert.equal(propose("bb".repeat(20)).data?.toString("hex"), word("01"));
  const ballot = vote("bb".repeat(20), 3, 1);
  assert.equal(ballot.amount, 0n);
  assert.equal(ballot.data?.toString("hex"), word("02") + word("03") + word("01"));
});

test("the server accepts only a well-formed, correctly signed transaction", async () => {
  const identity = identityFromSeed("verify-user", Buffer.from("7c".repeat(32), "hex"));
  const built = signTx(identity, { nonce: 4, to: "11".repeat(20), amount: zToUnits(2), fee: 10_000n });
  const verified = verifyL1Tx(built);
  assert.equal(verified.from, built.from);
  assert.equal(verified.amount, zToUnits(2).toString());

  assert.throws(() => verifyL1Tx({ ...built, amount: zToUnits(3).toString() }));
  assert.throws(() => verifyL1Tx({ ...built, to: "22".repeat(20) }));
  assert.throws(() => verifyL1Tx({ ...built, nonce: 5 }));
  assert.throws(() => verifyL1Tx({ ...built, signature: "00".repeat(64) }));
  assert.throws(() => verifyL1Tx({ ...built, from: "ab" }));
  assert.throws(() => verifyL1Tx(null));
});

