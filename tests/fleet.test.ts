import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { machinesFor, receiptMacValid, shardOf, signReceipt, CONNECTIONS_PER_GATEWAY, TRANSFERS_PER_SHARD } from "../lib/fleet.ts";

test("fleet size is the machine count for the requested load", () => {
  const plan = machinesFor(200_000_000, 1_000_000_000);
  assert.equal(plan.gateways, Math.ceil(200_000_000 / CONNECTIONS_PER_GATEWAY));
  assert.equal(plan.shards, Math.ceil(1_000_000_000 / TRANSFERS_PER_SHARD));
  assert.equal(plan.gateways, 10_000);
  assert.equal(plan.shards, 10_000_000);
});

test("a receipt is accepted once on the destination shard", async () => {
  process.env.ZENDO_DISABLE_TIMER = "1";
  process.env.ZENDO_SHARD_COUNT = "2";
  process.env.ZENDO_SHARD_INDEX = "0";
  process.env.ZENDO_SHARD_SECRET = "fleet-test-secret";
  process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-shard0-"));
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const { ZENDO_OPERATOR } = await import("../lib/seed.ts");
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  let dest = "";
  for (let i = 0; i < 8000 && !dest; i += 1) {
    const address = `znd1${i.toString(16).padStart(38, "0")}`;
    if (shardOf(address, 2) === 1) dest = address;
  }
  assert.ok(dest);
  await engine.send(operator.id, dest, "ZCOIN", "1");
  const { readState } = await import("../lib/state.ts");
  const source = readState();
  assert.ok(source);
  assert.equal(source.outbox.length, 1);
  assert.equal(source.accounts[dest].balances.ZCOIN, undefined);
  const sourceAudit = await engine.auditSupply();
  assert.equal(sourceAudit.ok, true, `${sourceAudit.accounted} vs ${sourceAudit.supply}`);
  const receipt = signReceipt(
    {
      id: source.outbox[0].id,
      fromShard: 0,
      toShard: 1,
      to: dest,
      asset: "ZCOIN",
      amount: source.outbox[0].amount,
    },
    "fleet-test-secret",
  );
  assert.equal(receiptMacValid(receipt, "fleet-test-secret"), true);
  receipt.mac = "ab".repeat(32);
  assert.equal(receiptMacValid(receipt, "fleet-test-secret"), false);

  process.env.ZENDO_SHARD_INDEX = "1";
  process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-shard1-"));
  await engine.testingReset();
  const landed = await engine.ingestShardReceipt(source.outbox[0]);
  assert.equal(landed.duplicate, false);
  const again = await engine.ingestShardReceipt(source.outbox[0]);
  assert.equal(again.duplicate, true);
  const destLedger = readState();
  assert.ok(destLedger);
  assert.equal(destLedger.followerShard, true);
  assert.equal(destLedger.accounts[dest].balances.ZCOIN, source.outbox[0].amount);
  const destAudit = await engine.auditSupply();
  assert.equal(destAudit.ok, true, `${destAudit.accounted} vs ${destAudit.supply}`);
  delete process.env.ZENDO_SHARD_COUNT;
  delete process.env.ZENDO_SHARD_INDEX;
  delete process.env.ZENDO_SHARD_SECRET;
});
