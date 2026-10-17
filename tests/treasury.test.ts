import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { MAX_SUPPLY_UNITS, totalZcoinUnits } from "../lib/supply-audit.ts";
import { ZENDO_OPERATOR } from "../lib/seed.ts";

process.env.ZENDO_DISABLE_TIMER = "1";
process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-treasury-"));

test("rewards never mint and stop safely when the treasury is empty", async () => {
  const engine = await import("../lib/engine.ts");
  const { SYSTEM } = await import("../lib/state.ts");
  await engine.testingReset();

  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);

  const read = async () => {
    const snapshot = JSON.parse(await engine.ledgerSnapshot()) as { accounts: Record<string, { balances: { ZCOIN?: string } }> };
    const treasury = BigInt(snapshot.accounts[SYSTEM.treasury]?.balances.ZCOIN || "0");
    return { treasury, supply: totalZcoinUnits(snapshot) };
  };

  const before = await read();
  assert.ok(before.treasury > 0n, "the genesis treasury reserve should be funded");
  assert.equal(before.supply, MAX_SUPPLY_UNITS);

  // Asking for far more than the reserve pays at most what the reserve holds, and never mints.
  const poolZ = before.treasury / 10n ** 18n;
  const requested = (poolZ + 1_000_000n).toString();
  const drained = await engine.debugPayReward(operator.id, requested);
  const mid = await read();
  assert.equal(mid.treasury, 0n, "the reward should drain, not overdraw, the treasury");
  assert.equal(mid.supply, MAX_SUPPLY_UNITS, "paying a reward must move coins, not mint them");
  assert.ok(BigInt(drained.net) > 0n);

  // A second reward on an empty reserve pays nothing and still never mints.
  const empty = await engine.debugPayReward(operator.id, "1000");
  assert.equal(empty.net, "0", "an empty treasury must pay zero");
  const after = await read();
  assert.equal(after.supply, MAX_SUPPLY_UNITS);
  assert.equal(after.treasury, 0n);

  const audit = await engine.auditSupply();
  assert.equal(audit.ok, true, `${audit.accounted} vs ${audit.supply}`);
  assert.ok(BigInt(audit.supply) <= MAX_SUPPLY_UNITS);
});
