import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { encodeLockData, LOCKED_TOPIC, verifyRelease, zendoAccountHash } from "../lib/bridge-proof.ts";
import { ZENDO_OPERATOR } from "../lib/seed.ts";

process.env.ZENDO_DISABLE_TIMER = "1";
process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-observer-"));
process.env.ZENDO_BRIDGE_PRIVATE_KEY = "22".repeat(32);
process.env.ZENDO_POLYGON_BRIDGE = `0x${"cd".repeat(20)}`;
process.env.ZENDO_POLYGON_CHAIN_ID = "137";
process.env.ZENDO_BRIDGE_CONFIRMATIONS = "0";
process.env.ZENDO_RPC_ALLOW_LOOPBACK = "1";

const BRIDGE = process.env.ZENDO_POLYGON_BRIDGE!;

test("a lock is observed once, signed, and cannot be replayed", async () => {
  let operatorAddress = "";
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { method?: string };
      let result: unknown = null;
      if (body.method === "eth_chainId") result = "0x89";
      else if (body.method === "eth_getBlockByNumber") {
        result = {
          number: "0x20",
          hash: `0x${"11".repeat(32)}`,
          parentHash: `0x${"22".repeat(32)}`,
          timestamp: "0x10",
          transactions: [],
        };
      } else if (body.method === "eth_getLogs") {
        result = [{
          address: BRIDGE,
          topics: [LOCKED_TOPIC, `0x${"33".repeat(32)}`, zendoAccountHash(operatorAddress)],
          data: encodeLockData(2n * 10n ** 18n, 7n),
          logIndex: "0x0",
          transactionHash: `0x${"44".repeat(32)}`,
          blockNumber: "0x10",
        }];
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("mock rpc did not bind");
    process.env.POLYGON_RPC_URL = `http://127.0.0.1:${address.port}`;

    const engine = await import("../lib/engine.ts");
    await engine.testingReset();
    const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
    assert.ok(operator);
    operatorAddress = operator.address;
    await engine.bridgeSeed(operator.id, "10");
    const before = await engine.wallet(operator.id);

    const first = await engine.scanBridge();
    assert.equal(first.skipped, false);
    if (!first.skipped) assert.equal(first.credited, 1);
    const credited = await engine.wallet(operator.id);
    assert.ok(Number(credited.zcoinRaw) > Number(before.zcoinRaw));

    const second = await engine.scanBridge();
    assert.equal(second.skipped, false);
    if (!second.skipped) assert.equal(second.credited, 0);
    const held = await engine.wallet(operator.id);
    assert.equal(held.zcoinRaw, credited.zcoinRaw);

    const locked = await engine.bridgeWithdraw(operator.id, `0x${"44".repeat(20)}`, "1");
    assert.equal(verifyRelease({
      chainId: locked.voucher.chainId,
      bridge: locked.voucher.bridge,
      recipient: locked.voucher.recipient,
      amount: BigInt(locked.voucher.amount),
      nonce: BigInt(locked.voucher.nonce),
      innerHash: locked.voucher.innerHash,
      signature: locked.voucher.signature,
      signer: locked.voucher.signer,
    }), true);
    const afterWithdraw = await engine.wallet(operator.id);
    await engine.debugRewindBridgeNonce();
    await assert.rejects(() => engine.bridgeWithdraw(operator.id, `0x${"44".repeat(20)}`, "1"));
    const afterReplay = await engine.wallet(operator.id);
    assert.equal(afterReplay.zcoinRaw, afterWithdraw.zcoinRaw);
    const supply = await engine.auditSupply();
    assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
