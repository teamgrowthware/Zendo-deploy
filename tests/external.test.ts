import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ZENDO_OPERATOR } from "../lib/seed.ts";

process.env.ZENDO_DISABLE_TIMER = "1";
process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-ext-"));

test("synthetic mint, burn, quarantine, and the 1500 asset registry", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const catalog = await engine.externalCatalog();
  assert.ok(catalog.count >= 1500);
  assert.ok(catalog.sample);
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const asset = catalog.sample;
  const base = {
    source: "https://rpc-a.example",
    assetId: asset.id,
    kind: "deposit",
    txHash: "0xabc",
    logIndex: 1,
    blockNumber: 100,
    headNumber: 100 + asset.confirmations - 1,
    topic: asset.topic,
    token: asset.token,
    amount: "5",
    zendoAccount: operator.address,
  };
  const minted = await engine.observeExternal(operator.id, [base, { ...base, source: "https://rpc-b.example" }]);
  assert.equal(minted.status, "mint");
  const wallet = await engine.wallet(operator.id);
  assert.ok(wallet.synthetics.some((row) => row.id === asset.id && row.amount === "5"));
  await assert.rejects(() => engine.observeExternal(operator.id, [base, { ...base, source: "https://rpc-b.example" }]));
  const burn = { ...base, kind: "withdraw", txHash: "0xdef" };
  const burned = await engine.observeExternal(operator.id, [burn, { ...burn, source: "https://rpc-c.example" }]);
  assert.equal(burned.status, "burn");
  const after = await engine.wallet(operator.id);
  assert.equal(after.synthetics.some((row) => row.id === asset.id), false);
  const odd = { ...base, txHash: "0x111", amount: "5" };
  const held = await engine.observeExternal(operator.id, [odd, { ...odd, source: "https://rpc-b.example", amount: "9" }]);
  assert.equal(held.status, "quarantine");
  const added = await engine.registerExternal(operator.id, {
    id: "polygon.example.usdc",
    symbol: "USDC",
    decimals: 6,
    chain: "polygon",
    token: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    eventName: "TokenLocked",
    topic: "0x" + "ab".repeat(32),
    confirmations: 64,
    minSources: 2,
    rpcs: [],
    enabled: true,
  });
  assert.ok(added.count >= 1501);
});
