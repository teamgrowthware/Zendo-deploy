import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { encodeLockData, LOCKED_TOPIC, verifyRelease, zendoAccountHash } from "../lib/bridge-proof.ts";
import { ZENDO_OPERATOR } from "../lib/seed.ts";

process.env.ZENDO_DISABLE_TIMER = "1";
process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-bridge-"));
process.env.ZENDO_BRIDGE_PRIVATE_KEY = "11".repeat(32);
process.env.ZENDO_POLYGON_BRIDGE = `0x${"ab".repeat(20)}`;
process.env.ZENDO_POLYGON_CHAIN_ID = "137";

const BRIDGE = process.env.ZENDO_POLYGON_BRIDGE;
const TX = `0x${"cd".repeat(32)}`;

function receipt(address: string, amount: bigint, logIndex = 0) {
  return {
    status: "0x1",
    logs: [
      {
        address: BRIDGE,
        topics: [LOCKED_TOPIC, `0x${"22".repeat(32)}`, zendoAccountHash(address)],
        data: encodeLockData(amount, 1n),
        logIndex: `0x${logIndex.toString(16)}`,
        transactionHash: TX,
      },
    ],
  };
}

test("a withdrawal locks coins and a deposit pays them back once", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const before = await engine.wallet(operator.id);
  const opened = await engine.bridgeDesk(operator.id);
  assert.equal(opened.configured, true);

  const locked = await engine.bridgeWithdraw(operator.id, `0x${"44".repeat(20)}`, "2");
  assert.equal(locked.voucher.nonce, 1);
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
  const tampered = `${locked.voucher.signature.slice(0, -2)}00`;
  assert.equal(verifyRelease({
    chainId: locked.voucher.chainId,
    bridge: locked.voucher.bridge,
    recipient: locked.voucher.recipient,
    amount: BigInt(locked.voucher.amount),
    nonce: BigInt(locked.voucher.nonce),
    innerHash: locked.voucher.innerHash,
    signature: tampered,
    signer: locked.voucher.signer,
  }), false);

  const held = await engine.wallet(operator.id);
  assert.ok(Number(held.zcoinRaw) < Number(before.zcoinRaw));
  await assert.rejects(() => engine.debugDepositReceipt(operator.id, receipt(operator.address, 5n * 10n ** 18n), TX));
  const stillHeld = await engine.wallet(operator.id);
  assert.equal(stillHeld.zcoinRaw, held.zcoinRaw);

  const paid = await engine.debugDepositReceipt(operator.id, receipt(operator.address, 2n * 10n ** 18n), TX);
  assert.equal(paid.credited.length, 1);
  await assert.rejects(() => engine.debugDepositReceipt(operator.id, receipt(operator.address, 2n * 10n ** 18n), TX));
  await assert.rejects(() => engine.debugDepositReceipt(operator.id, receipt(`znd1${"ab".repeat(19)}`, 2n * 10n ** 18n, 1), TX));

  const after = await engine.wallet(operator.id);
  const spent = Number(before.zcoinRaw) - Number(after.zcoinRaw);
  assert.ok(spent > 0.0009 && spent < 0.0011);
  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
});

test("a withdrawal without a signer does not lock coins", async () => {
  const previous = process.env.ZENDO_BRIDGE_PRIVATE_KEY;
  delete process.env.ZENDO_BRIDGE_PRIVATE_KEY;
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const before = await engine.wallet(operator.id);
  await assert.rejects(() => engine.bridgeWithdraw(operator.id, `0x${"44".repeat(20)}`, "1"));
  const after = await engine.wallet(operator.id);
  assert.equal(after.zcoinRaw, before.zcoinRaw);
  process.env.ZENDO_BRIDGE_PRIVATE_KEY = previous;
});
