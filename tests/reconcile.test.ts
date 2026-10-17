import assert from "node:assert/strict";
import test from "node:test";
import { addressFromPublic, identityFromSeed } from "../lib/l1/crypto";
import {
  applyReconcile,
  collectConfirmed,
  reconcile,
  resetForRebuild,
  type ChainBlock,
  type ChainSource,
  type ChainTx,
  type ReadModel,
} from "../lib/l1/reconcile";

const alice = identityFromSeed("alice", Buffer.alloc(32, 7));
const bob = identityFromSeed("bob", Buffer.alloc(32, 9));
const appBob = "znd1" + "ab".repeat(19);
const treasury = "ff".repeat(20);

function transfer(id: string, fromKey: Buffer, to: string, amount: string, fee = "0"): ChainTx {
  return { id, from: fromKey.toString("hex"), to, amount, fee, data: "" };
}

function source(blocks: ChainBlock[], finalized = blocks.length ? Math.max(...blocks.map((b) => b.height)) : 0, balances: Record<string, string> = {}): ChainSource {
  return {
    finalized: async () => finalized,
    block: async (height) => {
      const block = blocks.find((item) => item.height === height);
      if (!block) throw new Error(`block ${height} not found`);
      return block;
    },
    balance: async (address) => balances[address] ?? "0",
  };
}

function baseModel(): ReadModel {
  return {
    accounts: {
      [alice.address]: { balances: { ZCOIN: "1000" } },
      [appBob]: { balances: { ZCOIN: "0" } },
      [treasury]: { balances: {} },
    },
    users: [
      { address: alice.address, l1Address: alice.address },
      { address: appBob, l1Address: bob.address },
    ],
    reconcileHeight: 0,
    reconcileApplied: [],
    reconcileFees: "0",
  };
}

function total(model: ReadModel): bigint {
  let sum = 0n;
  for (const account of Object.values(model.accounts)) sum += BigInt(account.balances.ZCOIN || "0");
  return sum;
}

test("folds a confirmed transfer into the read model and conserves supply", async () => {
  const model = baseModel();
  const blocks: ChainBlock[] = [{ height: 1, txs: [transfer("tx1", alice.publicKey, bob.address, "100", "5")] }];
  const report = await reconcile(model, source(blocks, 1), { feeSink: treasury });

  assert.equal(report.applied, 1);
  assert.equal(report.errors.length, 0);
  assert.equal(model.accounts[alice.address].balances.ZCOIN, "895");
  assert.equal(model.accounts[appBob].balances.ZCOIN, "100");
  assert.equal(model.accounts[treasury].balances.ZCOIN, "5");
  assert.equal(model.reconcileHeight, 1);
  assert.equal(report.fees, "5");
  assert.equal(total(model), 1000n);
  assert.equal(addressFromPublic(alice.publicKey), alice.address);
});

test("replay is idempotent: a resumed pass applies nothing", async () => {
  const model = baseModel();
  const blocks: ChainBlock[] = [{ height: 1, txs: [transfer("tx1", alice.publicKey, bob.address, "100", "5")] }];
  await reconcile(model, source(blocks, 1), { feeSink: treasury });
  const again = await reconcile(model, source(blocks, 1), { feeSink: treasury });

  assert.equal(again.applied, 0);
  assert.equal(again.scanned, 0);
  assert.equal(model.accounts[alice.address].balances.ZCOIN, "895");
  assert.equal(total(model), 1000n);
});

test("the transaction guard blocks a double apply after a checkpoint reset", async () => {
  const model = baseModel();
  const blocks: ChainBlock[] = [{ height: 1, txs: [transfer("tx1", alice.publicKey, bob.address, "100", "5")] }];
  await reconcile(model, source(blocks, 1), { feeSink: treasury });
  model.reconcileHeight = 0;
  const replay = await reconcile(model, source(blocks, 1), { feeSink: treasury });

  assert.equal(replay.applied, 0);
  assert.equal(replay.duplicate, 1);
  assert.equal(model.accounts[alice.address].balances.ZCOIN, "895");
  assert.equal(total(model), 1000n);
});

test("a repeated transaction inside one pass is applied once and counted as duplicate", async () => {
  const model = baseModel();
  const tx = transfer("tx-dup", alice.publicKey, bob.address, "10", "1");
  const blocks: ChainBlock[] = [{ height: 1, txs: [tx, { ...tx }] }];
  const report = await reconcile(model, source(blocks, 1), { feeSink: treasury });

  assert.equal(report.applied, 1);
  assert.equal(report.duplicate, 1);
  assert.equal(model.accounts[alice.address].balances.ZCOIN, "989");
});

test("unmapped parties and non-transfer activity are reported, not applied", async () => {
  const model = baseModel();
  const stranger = identityFromSeed("stranger", Buffer.alloc(32, 3));
  const blocks: ChainBlock[] = [
    {
      height: 1,
      txs: [
        transfer("tx-unmapped", alice.publicKey, stranger.address, "10", "1"),
        { id: "tx-stake", from: alice.publicKey.toString("hex"), to: "0000000000000000000000000000000000000001", amount: "5", fee: "1", data: "0100000000" },
      ],
    },
  ];
  const report = await reconcile(model, source(blocks, 1), { feeSink: treasury });

  assert.equal(report.applied, 0);
  assert.equal(report.unmapped, 1);
  assert.equal(report.ignored, 1);
  assert.equal(model.accounts[alice.address].balances.ZCOIN, "1000");
});

test("a missing block stops the pass, is reported, and does not advance the height", async () => {
  const model = baseModel();
  const blocks: ChainBlock[] = [{ height: 1, txs: [transfer("tx1", alice.publicKey, bob.address, "10", "1")] }];
  const report = await reconcile(model, source(blocks, 3), { feeSink: treasury });

  assert.equal(report.applied, 1);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].startsWith("block 2:"), true);
  assert.equal(model.reconcileHeight, 1);
  assert.equal(total(model), 1000n);
});

test("collectConfirmed resumes from the checkpoint height", async () => {
  const model = baseModel();
  const blocks: ChainBlock[] = [
    { height: 1, txs: [transfer("tx1", alice.publicKey, bob.address, "10", "1")] },
    { height: 2, txs: [transfer("tx2", alice.publicKey, bob.address, "10", "1")] },
  ];
  await reconcile(model, source(blocks, 2), { feeSink: treasury });
  const collected = await collectConfirmed(source(blocks, 2), model.reconcileHeight! + 1);
  assert.equal(collected.blocks.length, 0);
});

test("rebuild clears the guard and replays every confirmed transfer", async () => {
  const model = baseModel();
  const blocks: ChainBlock[] = [{ height: 1, txs: [transfer("tx1", alice.publicKey, bob.address, "100", "0")] }];
  await reconcile(model, source(blocks, 1), { feeSink: treasury });
  assert.equal(model.accounts[alice.address].balances.ZCOIN, "900");

  resetForRebuild(model);
  const replay = await reconcile(model, source(blocks, 1), { feeSink: treasury });
  assert.equal(replay.applied, 1);
  assert.equal(model.reconcileHeight, 1);
  assert.equal(total(model), 1000n);
});

test("divergence detection compares touched accounts with the chain", async () => {
  const model = baseModel();
  const blocks: ChainBlock[] = [{ height: 1, txs: [transfer("tx1", alice.publicKey, bob.address, "100", "0")] }];
  const report = await reconcile(model, source(blocks, 1, { [alice.address]: "1", [bob.address]: "100" }), {
    feeSink: treasury,
    checkDivergence: true,
  });
  assert.ok(report.diverged.some((row) => row.address === alice.address));
  assert.ok(!report.diverged.some((row) => row.address === appBob && row.readModel === "100"));
});

test("applyReconcile is synchronous so it can run inside one ordered commit", () => {
  const model = baseModel();
  const collected = { blocks: [{ height: 1, txs: [transfer("tx1", alice.publicKey, bob.address, "100", "5")] }], errors: [], chainHeight: 1 };
  const report = applyReconcile(model, collected, 1, { feeSink: treasury });
  assert.equal(report.applied, 1);
  assert.equal(model.accounts[appBob].balances.ZCOIN, "100");
});
