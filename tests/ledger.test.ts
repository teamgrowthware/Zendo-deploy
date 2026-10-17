import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";

test("concurrent balance updates commit without dropping one", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "zendo-ledger-"));
  process.env.ZENDO_DATA_DIR = dir;
  const address = `znd1${"ab".repeat(19)}`;
  const { openLedger, closeLedger, ledgerPath } = await import("../lib/ledger-store.ts");
  openLedger();
  closeLedger();
  const workers = 4;
  const each = 25;
  await Promise.all(
    Array.from({ length: workers }, () => new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./ledger-worker.mjs", import.meta.url), {
        workerData: { file: ledgerPath(), address, count: each },
      });
      worker.once("error", reject);
      worker.once("exit", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`worker exit ${code}`))));
    })),
  );
  process.env.ZENDO_DATA_DIR = dir;
  const again = await import("../lib/ledger-store.ts");
  assert.equal(again.readBalance(address), String(workers * each));
  again.closeLedger();
});

test("the engine stores the ledger in sqlite", async () => {
  process.env.ZENDO_DISABLE_TIMER = "1";
  process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-sqlite-engine-"));
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const { ZENDO_OPERATOR } = await import("../lib/seed.ts");
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const dest = `znd1${"12".repeat(19)}`;
  await Promise.all([
    engine.send(operator.id, dest, "ZCOIN", "1"),
    engine.send(operator.id, dest, "ZCOIN", "1"),
    engine.send(operator.id, dest, "ZCOIN", "1"),
  ]);
  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
  assert.equal(existsSync(path.join(process.env.ZENDO_DATA_DIR, "state.json")), false);
  assert.equal(existsSync(path.join(process.env.ZENDO_DATA_DIR, "zendo.sqlite")), true);
  const { readState } = await import("../lib/state.ts");
  const ledger = readState();
  assert.ok(ledger);
  assert.equal(ledger.accounts[dest].balances.ZCOIN, (3n * 10n ** 18n).toString());
});

test("a simultaneous burst of sends all lands in one commit", async () => {
  process.env.ZENDO_DISABLE_TIMER = "1";
  process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-burst-"));
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const { ZENDO_OPERATOR } = await import("../lib/seed.ts");
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const dest = `znd1${"34".repeat(19)}`;
  const count = 64;
  await Promise.all(Array.from({ length: count }, () => engine.send(operator.id, dest, "ZCOIN", "0.01")));
  const { readState } = await import("../lib/state.ts");
  const ledger = readState();
  assert.ok(ledger);
  assert.equal(ledger.accounts[dest].balances.ZCOIN, (BigInt(count) * 10n ** 16n).toString());
  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
});
