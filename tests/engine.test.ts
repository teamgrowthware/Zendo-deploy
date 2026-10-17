import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ZENDO_OPERATOR } from "../lib/seed.ts";

process.env.ZENDO_DISABLE_TIMER = "1";
process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-"));

test("the chain conserves supply and trades on a curve", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);

  const board = await engine.coins("new");
  assert.equal(board.length, 0);

  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const before = await engine.wallet(operator.id);
  const created = await engine.createCoin(operator.id, {
    name: "Test Lantern",
    symbol: "TEST",
    description: "A coin created by the engine test.",
    emoji: "🎯",
    hue: 40,
  });
  const bought = await engine.swap(operator.id, created.mint, "buy", "2");
  assert.ok(bought.tx.hash.startsWith("0x"));
  const afterBuy = await engine.wallet(operator.id);
  assert.ok(afterBuy.tokens.some((token) => token.symbol === "TEST"));
  await engine.swap(operator.id, created.mint, "sell", "5000000");
  const afterSell = await engine.wallet(operator.id);
  const beforeNum = Number(before.zcoinRaw);
  const afterNum = Number(afterSell.zcoinRaw);
  assert.ok(afterNum < beforeNum);

  const quote = await engine.quote(created.mint, "buy", "90");
  assert.equal(typeof quote.tokens, "string");
  await engine.swap(operator.id, created.mint, "buy", "90");
  const heavy = await engine.coin(created.mint, operator.id);
  assert.equal(heavy.graduated, true);

  const still = await engine.auditSupply();
  assert.equal(still.ok, true, `${still.accounted} vs ${still.supply}`);

  await engine.delegate(operator.id, "val_01", "10");
  await engine.debugMine(3);
  const staked = await engine.wallet(operator.id);
  assert.ok(staked.stakes.length >= 1);
  await engine.undelegate(operator.id, staked.stakes[0].id, "10");
  const finalSupply = await engine.auditSupply();
  assert.equal(finalSupply.ok, true);
});

test("a passed grant pays the author from the treasury", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const before = await engine.wallet(operator.id);
  const filed = await engine.applyGrant(operator.id, {
    title: "Docs for the quote lab",
    body: "Write the learn page sample that quotes the FROG curve.",
    milestone: "The lab returns a token amount for a 1 Z buy.",
    amount: "10",
  });
  assert.equal(filed.grants[0].status, "active");
  const voted = await engine.voteGrant(operator.id, filed.grants[0].id, "yes");
  assert.equal(voted.grants[0].quorumMet, true);
  assert.equal(voted.grants[0].passed, true);
  const paid = await engine.payoutGrant(operator.id, filed.grants[0].id);
  assert.equal(paid.grants[0].status, "paid");
  await assert.rejects(() => engine.payoutGrant(operator.id, filed.grants[0].id));
  const after = await engine.wallet(operator.id);
  assert.ok(Number(after.zcoinRaw) > Number(before.zcoinRaw));
  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
});

test("a new wallet starts empty and a passed vote changes the trade fee", async () => {
  const engine = await import("../lib/engine.ts");
  const { getConfig } = await import("../lib/config.ts");
  await engine.testingReset();
  assert.equal(getConfig().airdrop, "0");
  const started = await engine.beginSignup({
    email: "empty-wallet@example.com",
    password: "Harbor-Lamp-42",
    displayName: "Empty",
  });
  const picks = started.quiz.map((index) => started.words[index]);
  await engine.answerSeed(started.pendingId, picks);
  const created = await engine.choosePin(started.pendingId, "2580");
  const wallet = await engine.wallet(created.id);
  assert.equal(Number(wallet.zcoinRaw), 0);

  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const filed = await engine.propose(operator.id, "Lower the trade fee", "Set the trade fee to 80 basis points on this chain.", {
    key: "trade_bps",
    value: "80",
  });
  assert.equal(filed[0].change, "trade_bps = 80");
  await assert.rejects(
    () => engine.propose(operator.id, "Lower the trade fee again", "A second open change to the same trade fee parameter.", { key: "trade_bps", value: "90" }),
    /already changes that parameter/,
  );
  await engine.voteProposal(operator.id, filed[0].id, "yes");
  const settled = await engine.debugSettle();
  assert.equal(settled[0].status, "passed");
  assert.equal(getConfig().tradeBps, 80);
  await assert.rejects(() =>
    engine.propose(operator.id, "Break the fee bound", "This value is outside the allowed range for a trade fee.", {
      key: "trade_bps",
      value: "99999",
    }),
  );
  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
});

test("jailing slashes ten percent once and pauses rewards", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  await engine.delegate(operator.id, "val_01", "10");
  const jailed = await engine.adminValidator(operator.id, "val_01", "jailed");
  const row = jailed.validators.find((validator) => validator.id === "val_01");
  assert.equal(row?.status, "jailed");
  assert.equal(jailed.slashes.length, 1);
  const again = await engine.adminValidator(operator.id, "val_01", "jailed");
  assert.equal(again.slashes.length, 1);
  await assert.rejects(() => engine.adminValidator(operator.id, "val_missing", "active"), /Validator not found/);
  await assert.rejects(() => engine.delegate(operator.id, "val_01", "10"));
  await assert.rejects(() => engine.claim(operator.id, "all"));
  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
});

test("a listing keeps one rating per account", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const board = await engine.publishListing(operator.id, {
    name: "Quote helper",
    summary: "A note that points at the live curve quote on the learn page.",
    kind: "sdk",
  });
  assert.equal(board.listings[0].kind, "sdk");
  assert.equal(board.listings[0].votes, 0);
  const rated = await engine.rateListing(operator.id, board.listings[0].id, 4);
  assert.equal(rated.listings[0].rating, 4);
  assert.equal(rated.listings[0].votes, 1);
  const again = await engine.rateListing(operator.id, board.listings[0].id, 5);
  assert.equal(again.listings[0].votes, 1);
  assert.equal(again.listings[0].rating, 5);
  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
});

test("paged reads stay consistent and a bad RPC does not move supply", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const pages = await Promise.all(Array.from({ length: 24 }, (_, index) => engine.blockPage(index + 1)));
  assert.ok(pages.every((page) => page.page >= 1 && page.rows.length <= 24));
  const txs = await engine.transactionPage(1);
  assert.equal(txs.page, 1);
  await assert.rejects(() => engine.rpc("zendo_nope", [], null), /Unknown method/);
  for (let i = 0; i < 200; i += 1) engine.rateRpc("stress-page", 60);
  const heights = await Promise.all(Array.from({ length: 40 }, () => engine.rpc("zendo_blockNumber", [], null)));
  assert.ok(heights.every((height) => height === heights[0]));
  const after = await engine.auditSupply();
  assert.equal(after.ok, true, `${after.accounted} vs ${after.supply}`);
});

test("founder locks, public supply, and phrase recovery stay on the same wallet", async () => {
  const engine = await import("../lib/engine.ts");
  const { addressFromPhrase } = await import("../lib/ids.ts");
  const { phraseText } = await import("../lib/words.ts");
  const { founderVestingAddress } = await import("../lib/zendo-founders.ts");
  const { PUBLIC_ALLOCATION_Z, TOTAL_SUPPLY_Z, describePublic, supplyUnits } = await import("../lib/zendo-supply.ts");
  await engine.testingReset();

  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
  assert.equal(supply.supply, supplyUnits(TOTAL_SUPPLY_Z).toString());

  const coin = await engine.zcoin();
  assert.equal(coin.symbol, "$ZCoin");
  assert.equal(coin.founder, "300M");
  assert.equal(coin.publicAllocation, "700M");
  assert.equal(coin.founders.length, 3);
  assert.equal(coin.founders[0].role, "Co-founder and President");
  assert.deepEqual(
    coin.founders.map((row) => row.allocation),
    ["200M", "50M", "50M"],
  );
  assert.deepEqual(
    coin.founders.map((row) => [row.name, row.role, row.polygon]),
    [
      ["Louis Conner", "Co-founder and President", "0x18a0730008034177b40F1172aA5953a37dAE7102"],
      ["Prabhat Agrawal", "Founder", "0xD319679625599303393084671a3AdaB52ea999B3"],
      ["Pratyaksh Lutare", "Founder", "0x3336a52Cd82F01956147aed641F35694a235fbc9"],
    ],
  );
  for (const row of coin.founders) {
    assert.equal(row.vestingAddress.startsWith("znd1"), true);
    assert.equal(row.walletAddress.startsWith("znd1"), true);
    assert.notEqual(row.vestingAddress, row.walletAddress);
  }

  const { readState } = await import("../lib/state.ts");
  const ledger = readState();
  assert.ok(ledger);
  const operator = ledger.users.find((user: { email: string }) => user.email === ZENDO_OPERATOR.email);
  assert.equal(ledger.accounts[operator.address].label, "System wallet · Zendo Operator");
  assert.equal(ledger.accounts[operator.address].balances.ZCOIN, describePublic().operator.toString());
  assert.equal(ledger.accounts[founderVestingAddress("louis-conner")].balances.ZCOIN, supplyUnits("200000000").toString());
  const publicUnits = supplyUnits(PUBLIC_ALLOCATION_Z);
  const founderUnits = supplyUnits("300000000");
  assert.equal(founderUnits + publicUnits, supplyUnits(TOTAL_SUPPLY_Z));

  const started = await engine.beginSignup({
    email: "recover-wallet@example.com",
    password: "Harbor-Lamp-42",
    displayName: "Recover",
  });
  const pendingFile = readState();
  assert.ok(pendingFile);
  const pending = pendingFile.pending[0];
  assert.equal(pending.phrase, undefined);
  const stored = JSON.stringify(pending);
  assert.equal(stored.includes(started.words.join(" ")), false);
  assert.equal(pending.words, undefined);
  const picks = started.quiz.map((index: number) => started.words[index]);
  await engine.answerSeed(started.pendingId, picks);
  const created = await engine.choosePin(started.pendingId, "2580");
  assert.equal(created.address, addressFromPhrase(phraseText(started.words)));
  assert.equal(created.address.startsWith("znd1"), true);

  const signedIn = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(signedIn);
  const beforeStake = await engine.wallet(signedIn.id);
  assert.equal(Number(beforeStake.zcoinRaw), 100000);
  await engine.delegate(signedIn.id, "val_01", "10");
  const staked = await engine.wallet(signedIn.id);
  assert.equal(staked.stakes.length, 1);
  await engine.recover({
    email: ZENDO_OPERATOR.email,
    phrase: ZENDO_OPERATOR.phrase.join(" "),
    password: "Harbor-Lamp-99",
    pin: "1357",
  });
  const restored = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(restored);
  assert.equal(restored.address, signedIn.address);
  const afterRecover = await engine.wallet(signedIn.id);
  assert.equal(afterRecover.zcoinRaw, staked.zcoinRaw);
  assert.equal(afterRecover.stakes[0].id, staked.stakes[0].id);
  assert.equal(afterRecover.stakes[0].amount, staked.stakes[0].amount);

  const beforeClaim = await engine.wallet(signedIn.id);
  const locked = await engine.zcoin();
  assert.equal(locked.launched, false);
  assert.equal(locked.anchor, null);
  assert.equal(locked.claimable, "0");
  await assert.rejects(() => engine.claimVesting(signedIn.id), /Public launch has not started/);
  await engine.notePublicRequest({ get: () => "https://zendo.example" });
  const stillLocked = await engine.zcoin();
  assert.equal(stillLocked.launched, false);
  const launchAt = Date.now() - 400 * 24 * 60 * 60 * 1000;
  await engine.debugStampLaunch(launchAt);
  const opened = await engine.zcoin();
  assert.equal(opened.launched, true);
  assert.equal(opened.anchor, launchAt);
  const louis = opened.founders.find((row) => row.id === "louis-conner");
  assert.ok(louis);
  assert.equal(louis.claimed, "50M");
  assert.equal(opened.founders.filter((row) => row.claimed === "12.5M").length, 2);
  const afterClaim = await engine.wallet(signedIn.id);
  assert.equal(afterClaim.zcoinRaw, beforeClaim.zcoinRaw);
  const still = await engine.auditSupply();
  assert.equal(still.ok, true, `${still.accounted} vs ${still.supply}`);
});
