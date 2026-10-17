import assert from "node:assert/strict";
import test from "node:test";
import type { ReadModel } from "../lib/l1/reconcile";

const saved = {
  NODE_ENV: process.env.NODE_ENV,
  custodial: process.env.ZENDO_L1_ALLOW_CUSTODIAL,
  simulation: process.env.ZENDO_L1_ALLOW_SIMULATION,
};

function enterProduction(): void {
  process.env.NODE_ENV = "production";
  delete process.env.ZENDO_L1_ALLOW_CUSTODIAL;
  delete process.env.ZENDO_L1_ALLOW_SIMULATION;
}

function restore(): void {
  if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = saved.NODE_ENV;
  if (saved.custodial === undefined) delete process.env.ZENDO_L1_ALLOW_CUSTODIAL;
  else process.env.ZENDO_L1_ALLOW_CUSTODIAL = saved.custodial;
  if (saved.simulation === undefined) delete process.env.ZENDO_L1_ALLOW_SIMULATION;
  else process.env.ZENDO_L1_ALLOW_SIMULATION = saved.simulation;
}

test("production refuses developer and custodial signing", async () => {
  const config = await import("../lib/l1/config");
  enterProduction();
  try {
    assert.equal(config.custodialSigningAllowed(), false);
    assert.equal(config.simulationAllowed(), false);
    assert.throws(() => config.signerForUser("user-1"), /recovery phrase/);
  } finally {
    restore();
  }
});

test("production refuses simulated settlement, fake mining and synthetic credits", async () => {
  const config = await import("../lib/l1/config");
  const engine = await import("../lib/engine");
  enterProduction();
  try {
    assert.equal(config.simulationAllowed(), false);
    assert.throws(() => config.assertSimulationAllowed("Fake mining"), /DEV\/TEST-only/);
    await assert.rejects(() => engine.debugMine(1), /DEV\/TEST-only/);
    await assert.rejects(() => engine.debugPayReward("nobody", "1"), /DEV\/TEST-only/);
    await assert.rejects(() => engine.debugSettle(), /DEV\/TEST-only/);
    await assert.rejects(() => engine.debugStampLaunch(Date.now()), /DEV\/TEST-only/);
    assert.throws(() => engine.debugDepositReceipt("nobody", {}, "0x00"), /DEV\/TEST-only/);
  } finally {
    restore();
  }
});

test("production refuses to settle without a client signature", async () => {
  const { settleRoute } = await import("../lib/l1/settle-route");
  enterProduction();
  try {
    await assert.rejects(
      () => settleRoute({ userId: "user-1", tx: null, build: () => ({ to: "0".repeat(40), amount: 0n }) }),
      /Sign this transaction on your device/,
    );
  } finally {
    restore();
  }
});

test("production refuses the committed operator seed defaults", async () => {
  const seed = await import("../lib/seed.ts");
  const savedPw = process.env.ZENDO_OPERATOR_PASSWORD;
  const savedPin = process.env.ZENDO_OPERATOR_PIN;
  const savedPhrase = process.env.ZENDO_OPERATOR_PHRASE;
  enterProduction();
  try {
    delete process.env.ZENDO_OPERATOR_PASSWORD;
    delete process.env.ZENDO_OPERATOR_PIN;
    delete process.env.ZENDO_OPERATOR_PHRASE;
    assert.throws(() => seed.ZENDO_OPERATOR.password, /ZENDO_OPERATOR_PASSWORD/);
    assert.throws(() => seed.ZENDO_OPERATOR.phrase, /ZENDO_OPERATOR_PHRASE/);
  } finally {
    if (savedPw !== undefined) process.env.ZENDO_OPERATOR_PASSWORD = savedPw;
    if (savedPin !== undefined) process.env.ZENDO_OPERATOR_PIN = savedPin;
    if (savedPhrase !== undefined) process.env.ZENDO_OPERATOR_PHRASE = savedPhrase;
    restore();
  }
});

test("reconciliation remains a permitted production path", async () => {
  const { simulationAllowed } = await import("../lib/l1/config");
  const { applyReconcile } = await import("../lib/l1/reconcile");
  const model: ReadModel = { accounts: {}, users: [], reconcileHeight: 0, reconcileApplied: [] };
  enterProduction();
  try {
    assert.equal(simulationAllowed(), false);
    const report = applyReconcile(model, { blocks: [], errors: [], chainHeight: 0 }, 1, {});
    assert.equal(report.applied, 0);
  } finally {
    restore();
  }
});
