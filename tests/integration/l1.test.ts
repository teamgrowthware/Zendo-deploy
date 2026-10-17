import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  L1Client,
  buy,
  delegate,
  deploy,
  identityFromSeed,
  launchCreate,
  propose,
  reconcile,
  sell,
  settle,
  signTx,
  transfer,
  txId,
  undelegate,
  vote,
  zToUnits,
} from "../../lib/l1/index.ts";
import type { ReadModel } from "../../lib/l1/index.ts";

/**
 * A disposable zendo-1 node on loopback. It never touches mainnet, the production chain, or any
 * real key: the node mints its own genesis key into a throwaway directory that is deleted on exit.
 * On Windows the Linux ELF runs under WSL, which forwards loopback to Windows, so the TypeScript
 * client reaches it at 127.0.0.1.
 */
const RPC_PORT = Number(process.env.ZENDO_IT_RPC_PORT || 47311);
const P2P_PORT = Number(process.env.ZENDO_IT_P2P_PORT || 47310);
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;
const repoRoot = process.cwd();
const nodeBinWindows = join(repoRoot, "node", "target", "debug", "zendo-node");

function toWslPath(win: string): string {
  const match = /^([A-Za-z]):\\(.*)$/.exec(win);
  if (!match) return win;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}

const isWindows = process.platform === "win32";
const dataDir = mkdtempSync(join(tmpdir(), "zendo-it-"));
const marker = dataDir.replace(/\\/g, "/").split("/").pop() as string;

function startNode(): ChildProcess {
  const args = ["run", "--data", isWindows ? toWslPath(dataDir) : dataDir, "--rpc", `127.0.0.1:${RPC_PORT}`, "--listen", `127.0.0.1:${P2P_PORT}`];
  if (!existsSync(nodeBinWindows)) throw new Error(`build the node first: ${nodeBinWindows} is missing`);
  if (isWindows) {
    return spawn("wsl.exe", ["-d", "Ubuntu", "-u", "mahek_saarla", "--", toWslPath(nodeBinWindows), ...args], { stdio: "ignore" });
  }
  return spawn(nodeBinWindows, args, { stdio: "ignore" });
}

function stopNode(): void {
  if (isWindows) {
    spawnSync("wsl.exe", ["-d", "Ubuntu", "-u", "mahek_saarla", "--", "pkill", "-f", marker], { stdio: "ignore" });
  } else {
    spawnSync("pkill", ["-f", marker], { stdio: "ignore" });
  }
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* the directory may already be gone */
  }
}

async function waitForNode(client: L1Client): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await client.rpc("zendo_chainId", []);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error("the disposable node never answered zendo_chainId");
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

test("the TypeScript client settles every L1 path on a live node", { timeout: 180_000 }, async () => {
  const node = startNode();
  const client = new L1Client(RPC_URL, 4_000);
  try {
    await waitForNode(client);

    // The genesis validator key is the only funded account. Read it from the throwaway directory.
    const meta = JSON.parse(readFileSync(join(dataDir, "meta.json"), "utf8")) as { secret_hex: string };
    const validator = identityFromSeed("validator", Buffer.from(meta.secret_hex, "hex"));
    assert.equal(await client.rpc<string>("zendo_localAddress", []), validator.address);

    const user = identityFromSeed("integration-user", Buffer.from("5a".repeat(32), "hex"));
    const supplied = BigInt(await client.balance(validator.address));
    assert.equal(supplied, 1_000_000_000_000_000_000_000_000_000n);

    // Fund the test user from the genesis validator.
    const fundNonce = await client.nonce(validator.address);
    const fund = signTx(validator, {
      nonce: fundNonce,
      to: user.address,
      amount: zToUnits(50),
      fee: 10_000n,
    });
    await client.submit(fund);
    await client.waitForReceipt(txId(fund));
    assert.equal(BigInt(await client.balance(user.address)), zToUnits(50));

    // 1. A plain transfer settles and the recipient balance reflects it.
    const peer = identityFromSeed("integration-peer", Buffer.from("6b".repeat(32), "hex"));
    const moved = await settle(client, user, transfer(peer.address, zToUnits(1)), { fee: 10_000n });
    assert.equal(moved.finalized, true);
    assert.equal(BigInt(await client.balance(peer.address)), zToUnits(1));

    // 2. A launchpad create charges the flat fee into the treasury and stores the curve program.
    const program = await client.launchProgram();
    const createNonce = await client.nonce(user.address);
    const coin = await client.contractAddress(user.address, createNonce);
    const created = await settle(client, user, launchCreate(program), { fee: 200_000n });
    assert.equal(created.finalized, true);
    assert.notEqual(await client.rpc<string>("zendo_getCode", [coin]), "");

    // 3. A buy pays native Z into the coin and finalizes.
    const bought = await settle(client, user, buy(coin, zToUnits("0.01")), { fee: 200_000n });
    assert.equal(bought.finalized, true);

    // 4. A sell returns tokens to the coin and pays native Z back to the seller.
    const sold = await settle(client, user, sell(coin, 1n), { fee: 200_000n });
    assert.equal(sold.finalized, true);

    // 5. Staking opens a bond the node can read back.
    const staked = await settle(client, user, delegate(0, zToUnits("0.5")), { fee: 10_000n });
    assert.equal(staked.finalized, true);
    const staking = await client.rpc<{ bonds: { delegator: string; amount: string }[] }>("zendo_staking", []);
    assert.ok(staking.bonds.some((bond) => bond.delegator === user.address), "the bond should be recorded");

    // 6. Undelegating returns the bond and clears it from the staking set.
    const unstaked = await settle(client, user, undelegate(0, zToUnits("0.5")), { fee: 10_000n });
    assert.equal(unstaked.finalized, true);
    const afterUnstake = await client.rpc<{ bonds: { delegator: string; amount: string }[] }>("zendo_staking", []);
    assert.ok(!afterUnstake.bonds.some((bond) => bond.delegator === user.address), "the bond should be released");

    // 7. Governance: deploy the program, open a proposal, vote yes, and read the tally back.
    const govProgram = await client.governanceProgram();
    const govNonce = await client.nonce(user.address);
    const gov = await client.contractAddress(user.address, govNonce);
    const govDeploy = await settle(client, user, deploy(govProgram), { fee: 10_000n });
    assert.equal(govDeploy.finalized, true);
    assert.notEqual(await client.rpc<string>("zendo_getCode", [gov]), "", "the governance program should be stored");
    const opened = await settle(client, user, propose(gov), { fee: 10_000n });
    assert.equal(opened.finalized, true);
    const balloted = await settle(client, user, vote(gov, 1, 1), { fee: 10_000n });
    assert.equal(balloted.finalized, true);
    const tally = await client.rpc<{ contract: string; proposals: { id: number; yes: number; no: number }[] }>("zendo_governance", [gov]);
    assert.ok(tally.proposals.some((row) => row.id === 1 && row.yes >= 1), "the yes vote should be tallied");

    // The cap holds across every operation.
    const after = await client.supply();
    assert.equal(after.total, supplied.toString());
    assert.equal(after.cap, "1000000000000000000000000000");

    // 8. Chain -> read-model reconciliation folds confirmed transfers and is idempotent.
    const feeSink = "ee".repeat(20);
    const model: ReadModel = {
      accounts: {
        [user.address]: { balances: { ZCOIN: await client.balance(user.address) } },
        [peer.address]: { balances: { ZCOIN: "0" } },
        [feeSink]: { balances: {} },
      },
      users: [],
      reconcileHeight: 0,
      reconcileApplied: [],
      reconcileFees: "0",
    };
    const totalBefore = Object.values(model.accounts).reduce((sum, account) => sum + BigInt(account.balances.ZCOIN || "0"), 0n);
    const first = await reconcile(model, client.reconcileSource(), { feeSink });
    assert.equal(first.errors.length, 0);
    assert.ok(first.applied >= 1, "the confirmed transfer should be folded in");
    assert.equal(model.accounts[peer.address].balances.ZCOIN, zToUnits(1).toString());
    assert.equal(first.chainHeight, await client.finalized());
    assert.equal(model.reconcileHeight, first.to);
    const totalAfter = Object.values(model.accounts).reduce((sum, account) => sum + BigInt(account.balances.ZCOIN || "0"), 0n);
    assert.equal(totalAfter, totalBefore, "reconciliation must conserve the projected supply");

    const replay = await reconcile(model, client.reconcileSource(), { feeSink });
    assert.equal(replay.applied, 0);
    assert.equal(replay.scanned, 0);
    assert.equal(model.accounts[peer.address].balances.ZCOIN, zToUnits(1).toString());

    // Simulate a checkpoint loss: the transaction guard must still block a double apply.
    model.reconcileHeight = 0;
    const guarded = await reconcile(model, client.reconcileSource(), { feeSink });
    assert.equal(guarded.applied, 0);
    assert.ok(guarded.duplicate >= 1, "the transaction guard should block a double apply");
    assert.equal(model.accounts[peer.address].balances.ZCOIN, zToUnits(1).toString());
  } finally {
    node.kill();
    stopNode();
  }
});
