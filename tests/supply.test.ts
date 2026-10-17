import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { MAX_SUPPLY_UNITS, totalZcoinUnits } from "../lib/supply-audit.ts";
import { ZENDO_OPERATOR } from "../lib/seed.ts";

process.env.ZENDO_DISABLE_TIMER = "1";
process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-supply-"));

async function supply(engine: { ledgerSnapshot(): Promise<string> }): Promise<bigint> {
  return totalZcoinUnits(JSON.parse(await engine.ledgerSnapshot()));
}

test("ZCoin supply is capped at 1,000,000,000 and never inflates", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();

  assert.equal(MAX_SUPPLY_UNITS, 1_000_000_000n * 10n ** 18n);
  assert.equal(await supply(engine), MAX_SUPPLY_UNITS);

  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);

  const created = await engine.createCoin(operator.id, {
    name: "Cap Coin",
    symbol: "CAP",
    description: "A coin that proves the supply cap holds.",
    emoji: "🔥",
    hue: 12,
  });
  assert.equal(await supply(engine), MAX_SUPPLY_UNITS);

  await engine.swap(operator.id, created.mint, "buy", "5");
  assert.equal(await supply(engine), MAX_SUPPLY_UNITS);

  await engine.swap(operator.id, created.mint, "sell", "5000000");
  assert.equal(await supply(engine), MAX_SUPPLY_UNITS);

  await engine.delegate(operator.id, "val_01", "25");
  await engine.debugMine(5);
  assert.equal(await supply(engine), MAX_SUPPLY_UNITS);

  await engine.debugPayReward(operator.id, "1000");
  assert.equal(await supply(engine), MAX_SUPPLY_UNITS);

  await engine.debugMine(10);
  assert.equal(await supply(engine), MAX_SUPPLY_UNITS);

  const audit = await engine.auditSupply();
  assert.equal(audit.ok, true, `${audit.accounted} vs ${audit.supply}`);
  assert.ok(BigInt(audit.supply) <= MAX_SUPPLY_UNITS);
  assert.ok((await supply(engine)) <= MAX_SUPPLY_UNITS);
});
