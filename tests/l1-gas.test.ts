import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("zendo-1 charges gas in ZendoCoin and keeps the public allocation", async () => {
  const genesis = JSON.parse(readFileSync(new URL("../zendo-chain/genesis/zendo-1.json", import.meta.url), "utf8")) as {
    networkId: string;
    nativeAsset: string;
    publicAllocation: string;
    gas: { transfer: string };
  };
  assert.equal(genesis.networkId, "zendo-1");
  assert.equal(genesis.nativeAsset, "ZCOIN");
  assert.equal(genesis.publicAllocation, "700000000");
  delete process.env.ZENDO_DATABASE_URL;
  delete process.env.ZENDO_DATABASE_REPLICA_URL;
  delete process.env.ZENDO_REDIS_URL;
  delete process.env.REDIS_URL;
  delete process.env.ZENDO_GRPC_PORT;
  process.env.ZENDO_DISABLE_TIMER = "1";
  process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-l1-"));
  const { loadConfig } = await import("../lib/config.ts");
  const cfg = loadConfig();
  assert.equal(cfg.networkId, "zendo-1");
  assert.equal(cfg.gas.transfer, "0.001");
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const { ZENDO_OPERATOR } = await import("../lib/seed.ts");
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const { readState } = await import("../lib/state.ts");
  const zOf = () => BigInt(readState()?.accounts[operator.address]?.balances.ZCOIN || "0");
  const before = zOf();
  await engine.send(operator.id, `znd1${"ab".repeat(19)}`, "ZCOIN", "1");
  const { parseUnits } = await import("../lib/format.ts");
  assert.equal(before - zOf(), parseUnits("1", 18) + parseUnits("0.001", 18));
});
