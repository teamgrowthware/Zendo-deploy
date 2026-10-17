import { rmSync } from "fs";
import { closeLedger } from "./ledger-store";
import { resetPostgres, usingPostgres } from "./ledger-pg";
import bcrypt from "bcryptjs";
import { bindChainParams, getConfig } from "./config";
import { parseParam, type ParamKey } from "./params";
import { capBuy, impactPct, quoteBuy, quoteSell, type Quote } from "./curve";
import { dataDir } from "./paths";
import { ZendoError } from "./errors";
import { FEE_SCHEDULE, judge, registryOf, validateAsset, type Observation } from "./external";
import { logEvent } from "./log";
import { chooseCanonical } from "./fork";
import { formatToken, formatZ, parseUnits, priceNumber } from "./format";
import { addressFromLabel, addressFromPhrase, nid, phraseHash, pickIndexes, randomHex, sha256, txHash } from "./ids";
import { pendingReward, splitReward } from "./rewards";
import {
  coinScore,
  contracts,
  labelOf,
  peers,
  presentAddress,
  presentAdmin,
  presentBlock,
  presentBlockDetail,
  presentCoin,
  presentCoinDetail,
  presentFees,
  presentHome,
  presentGrants,
  presentMarket,
  presentProposals,
  presentQuote,
  presentStats,
  presentStatus,
  presentTx,
  presentValidators,
  presentWallet,
  presentZcoin,
  toPublic,
} from "./present";
import {
  createEmptyState,
  readStateAsync,
  SYSTEM,
  writeStateAsync,
  type Coin,
  type PendingUser,
  type Revenue,
  type State,
  type Tx,
  type User,
  type Validator,
} from "./state";
import type { HistoryFile } from "./history";
import type { PublicUser, QuoteView, TicketView } from "./types";
import {
  addressOf,
  choiceOf,
  emailOf,
  emojiOf,
  hueOf,
  nameOf,
  passwordOf,
  pinOf,
  sideOf,
  symbolOf,
  textOf,
} from "./validate";
import { generatePhrase, normalizePhrase, phraseText } from "./words";
import { vestedAmount } from "./vesting";
import { cacheIncr, cacheSet } from "./cache";
import { ownsAccount } from "./db-route";
import { addressFromPublic, verifyEd25519 } from "./l1/crypto";
import { assertSimulationAllowed, custodialSigningAllowed } from "./l1/config";
import { applyReconcile, collectConfirmed, resetForRebuild, type ReconcileReport } from "./l1/reconcile";
import { L1Client } from "./l1/client";
import { postTransfer } from "./double-entry";
import { publishJob } from "./queue";
import { founderUnits, founderVestingAddress, founderWalletAddress, ZENDO_FOUNDERS } from "./zendo-founders";
import { OUTBOX_CAP, placement, receiptMacValid, shardOf, signReceipt, type ShardReceipt } from "./fleet";
import { bridgeSettings, parseLockLogs, parsePolygonAddress, signRelease, verifyRelease, zendoAccountHash } from "./bridge-proof";
import { fetchPolygonReceipt, polygonConfigured, polygonHead, polygonLockLogs, polygonTxHash } from "./polygon-receipt";
import { collectHits, exactHref } from "./search";
import {
  analyticsOf,
  applyCircle,
  applyFollow,
  applyMessage,
  applyPost,
  applyStory,
  applyUnfollow,
  applyVideo,
  ensureSocial,
  feedOf,
  inboxOf,
  profileOf,
} from "./social";

type BatchJob = {
  kind: "read" | "write";
  run: () => unknown;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

type Slot = {
  state?: State;
  queue: Promise<void>;
  batch: BatchJob[];
  epoch: number;
  timer?: ReturnType<typeof setInterval>;
  observer?: ReturnType<typeof setInterval>;
  signals?: boolean;
  statusValue?: ReturnType<typeof presentStatus>;
  statusAt?: number;
};

const root = globalThis as typeof globalThis & { __zendo?: Slot };

function slot(): Slot {
  if (!root.__zendo) root.__zendo = { queue: Promise.resolve(), batch: [], epoch: 0 };
  if (!root.__zendo.batch) root.__zendo.batch = [];
  if (typeof root.__zendo.epoch !== "number") root.__zendo.epoch = 0;
  return root.__zendo;
}

/**
 * Every call joins the open batch. The software does not cap how many users or
 * transactions can sit in that batch. setImmediate lets requests that arrived
 * in the same turn share one ordered apply and one disk commit.
 */
function enqueue<T>(kind: "read" | "write", fn: () => T): Promise<T> {
  const current = slot();
  const epoch = current.epoch;
  const promise = new Promise<T>((resolve, reject) => {
    current.batch.push({
      kind,
      run: fn as () => unknown,
      resolve: (value) => resolve(value as T),
      reject,
    });
  });
  if (current.batch.length === 1) setImmediate(() => drain(current, epoch));
  return promise;
}

async function drain(current: Slot, epoch: number) {
  if (current.epoch !== epoch) return;
  const jobs = current.batch.splice(0, current.batch.length);
  if (!jobs.length) return;
  try {
    await ensureLoaded();
  } catch (error) {
    for (const job of jobs) job.reject(error);
    return;
  }
  if (current.epoch !== epoch) {
    for (const job of jobs) job.reject(new ZendoError("The chain restarted before this landed."));
    return;
  }
  let dirty = false;
  const writes: { job: BatchJob; result: unknown }[] = [];
  for (const job of jobs) {
    if (current.epoch !== epoch) {
      job.reject(new ZendoError("The chain restarted before this landed."));
      continue;
    }
    try {
      if (job.kind === "read") {
        const state = current.state!;
        if (housekeeping(state)) dirty = true;
        job.resolve(job.run());
      } else {
        const snap = structuredClone(current.state);
        try {
          releaseUnbonding(current.state!);
          refreshProposals(current.state!);
          const result = job.run();
          dirty = true;
          current.statusAt = 0;
          writes.push({ job, result });
        } catch (error) {
          current.state = snap;
          if (current.state && error instanceof ZendoError && error.reason !== "user") {
            current.state.counters[error.reason] += 1;
            current.state.rejections.push({ at: Date.now(), reason: error.message, kind: error.reason });
            if (current.state.rejections.length > 80) current.state.rejections.shift();
            dirty = true;
          }
          job.reject(error);
        }
      }
    } catch (error) {
      job.reject(error);
    }
  }
  if (dirty && current.state && current.epoch === epoch) {
    try {
      await writeStateAsync(current.state);
    } catch (error) {
      for (const item of writes) item.job.reject(error);
      return;
    }
  }
  for (const item of writes) item.job.resolve(item.result);
  if (writes.length && current.state) void publishJob("ledger-commit", { height: String(current.state.height) });
  if (current.epoch === epoch && current.state) scheduleOutbox(current.state);
  if (current.epoch === epoch && current.batch.length) setImmediate(() => void drain(current, epoch));
}

let outboxDue = false;

function scheduleOutbox(state: State) {
  const here = placement();
  if (outboxDue) return;
  if (!state.outbox?.some((row) => !row.delivered && here.urls[row.toShard])) return;
  outboxDue = true;
  setTimeout(() => {
    outboxDue = false;
    void flushOutbox();
  }, 20);
}

async function flushOutbox() {
  const here = placement();
  const pending = await view((state) => state.outbox.filter((row) => !row.delivered && here.urls[row.toShard]).slice(0, 32));
  for (const receipt of pending) {
    const base = here.urls[receipt.toShard];
    if (!base) continue;
    try {
      const response = await fetch(new URL("/api/fleet/receipt", base), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(receipt),
      });
      if (!response.ok) continue;
      await mutate((state) => {
        const row = state.outbox.find((item) => item.id === receipt.id);
        if (row) row.delivered = true;
      });
    } catch {
      /* the next block timer tries again */
    }
  }
}

async function ensureLoaded() {
  if (placement().role === "gateway") throw new ZendoError("This process is a gateway and does not keep a ledger.", 503);
  const current = slot();
  if (!current.state) {
    const existing = await readStateAsync();
    if (existing) current.state = existing;
    else {
      const here = placement();
      const created = createEmptyState();
      if (here.role === "replica" || here.follower) blankFollower(created);
      else bootstrap(created);
      current.state = created;
      if (!(here.role === "replica" && usingPostgres())) await writeStateAsync(created);
    }
  }
  if (current.state && !Array.isArray(current.state.grants)) current.state.grants = [];
  if (current.state && !Array.isArray(current.state.listings)) current.state.listings = [];
  if (current.state && !current.state.params) current.state.params = {};
  if (current.state && !Array.isArray(current.state.slashes)) current.state.slashes = [];
  if (current.state && !current.state.founderClaims) current.state.founderClaims = {};
  if (current.state && current.state.publicLaunchAt == null) current.state.publicLaunchAt = null;
  if (current.state && !Array.isArray(current.state.tickets)) current.state.tickets = [];
  if (current.state) ensureSocial(current.state);
  if (current.state) {
    for (const user of current.state.users) {
      if (typeof user.banned !== "boolean") user.banned = false;
      if (user.role !== "user" && user.role !== "creator" && user.role !== "moderator" && user.role !== "admin") user.role = "user";
    }
    for (const ticket of current.state.tickets) {
      if ((ticket.status as string) === "answered") ticket.status = "resolved";
      if (!Array.isArray(ticket.notes)) ticket.notes = [];
      if (!Array.isArray(ticket.replies)) ticket.replies = [];
    }
    for (const coin of current.state.coins) {
      if (!Array.isArray(coin.promotions)) coin.promotions = [];
    }
  }
  if (current.state && !Array.isArray(current.state.bridgeWithdrawals)) current.state.bridgeWithdrawals = [];
  if (current.state && !Array.isArray(current.state.bridgeDeposits)) current.state.bridgeDeposits = [];
  if (current.state && !Array.isArray(current.state.bridgeReplay)) current.state.bridgeReplay = [];
  if (current.state && !Array.isArray(current.state.bridgeUnmatched)) current.state.bridgeUnmatched = [];
  if (current.state && typeof current.state.bridgeScanBlock !== "string") current.state.bridgeScanBlock = "0";
  if (current.state && !Array.isArray(current.state.externalAssets)) current.state.externalAssets = [];
  if (current.state && !Array.isArray(current.state.externalSeen)) current.state.externalSeen = [];
  if (current.state && !Array.isArray(current.state.externalQuarantine)) current.state.externalQuarantine = [];
  if (current.state && !current.state.externalMetrics) current.state.externalMetrics = { ingested: 0, minted: 0, burned: 0, quarantined: 0, fees: 0 };
  if (current.state && current.state.revenue && current.state.revenue.synthetic == null) current.state.revenue.synthetic = "0";
  if (current.state && typeof current.state.bridgeNonce !== "number") current.state.bridgeNonce = 0;
  if (current.state) {
    let renamed = false;
    if (!current.state.accounts[SYSTEM.bridge]) {
      current.state.accounts[SYSTEM.bridge] = {
        address: SYSTEM.bridge,
        userId: null,
        label: "Polygon bridge vault",
        balances: {},
        nonce: 0,
      };
      renamed = true;
    }
    const rename = (value: string) => (value === "Devnet Operator" ? "Zendo Operator" : value);
    for (const user of current.state.users) {
      if (user.displayName === "Devnet Operator") {
        user.displayName = "Zendo Operator";
        renamed = true;
      }
    }
    for (const account of Object.values(current.state.accounts)) {
      if (account.label === "Devnet Operator") {
        account.label = "Zendo Operator";
        renamed = true;
      }
    }
    for (const proposal of current.state.proposals) {
      if (!proposal.change) proposal.change = null;
      if (typeof proposal.applied !== "boolean") proposal.applied = proposal.status === "passed";
      const nextName = rename(proposal.authorName);
      if (nextName !== proposal.authorName) {
        proposal.authorName = nextName;
        renamed = true;
      }
    }
    for (const notice of current.state.notices) {
      if (notice.title === "Devnet node is up") {
        notice.title = "Zendo node is up";
        renamed = true;
      }
    }
    if (current.state.networkId.includes("devnet")) {
      current.state.networkId = getConfig().networkId;
      renamed = true;
    }
    bindChainParams(current.state.params);
    if (renamed) {
      current.statusAt = 0;
      await writeStateAsync(current.state);
    }
  }
  ensureTimer();
}

function ensureTimer() {
  const current = slot();
  if (placement().role === "replica") {
    if (current.timer || process.env.ZENDO_DISABLE_TIMER === "1") return;
    current.timer = setInterval(() => {
      void pullPrimarySnapshot().catch((error) => {
        logEvent("replica_sync_failed", { message: error instanceof Error ? error.message : "unknown" });
      });
    }, 5_000);
    current.timer.unref?.();
    return;
  }
  if (current.timer || process.env.ZENDO_DISABLE_TIMER === "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.npm_lifecycle_event === "build") return;
  current.timer = setInterval(() => {
    void enqueue("read", () => undefined);
  }, 1000);
  current.timer.unref?.();
  if (!current.observer) {
    current.observer = setInterval(() => {
      void scanBridge().catch((error) => {
        logEvent("bridge_observer_failed", { message: error instanceof Error ? error.message : "unknown" });
      });
    }, 20_000);
    current.observer.unref?.();
  }
  if (current.signals) return;
  current.signals = true;
  const stop = (signal: string) => {
    logEvent("shutdown", { signal });
    const live = slot();
    if (live.timer) clearInterval(live.timer);
    if (live.state) {
      void writeStateAsync(live.state).finally(() => process.exit(0));
      return;
    }
    process.exit(0);
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));
}

export async function testingReset() {
  if (usingPostgres()) await resetPostgres();
  const current = slot();
  const dropped = current.batch.splice(0, current.batch.length);
  current.epoch += 1;
  for (const job of dropped) job.reject(new ZendoError("The chain restarted before this landed."));
  if (current.timer) clearInterval(current.timer);
  if (current.observer) clearInterval(current.observer);
  closeLedger();
  rmSync(dataDir(), { recursive: true, force: true });
  root.__zendo = { queue: Promise.resolve(), batch: [], epoch: current.epoch };
  bindChainParams({});
}

function view<T>(fn: (state: State) => T): Promise<T> {
  return enqueue("read", () => fn(slot().state!));
}

function mutate<T>(fn: (state: State) => T): Promise<T> {
  if (placement().role === "replica") {
    return Promise.reject(new ZendoError("This region serves the app. A send, trade, or vote commits on the primary.", 409));
  }
  return enqueue("write", () => fn(slot().state!));
}

export async function ledgerSnapshot(): Promise<string> {
  return view((state) => JSON.stringify(state));
}

export async function installSnapshot(raw: string) {
  const parsed = JSON.parse(raw) as State;
  if (!parsed || parsed.version !== 2 || !parsed.accounts) throw new ZendoError("Snapshot is not this ledger.");
  await writeStateAsync(parsed);
  const current = slot();
  current.state = (await readStateAsync()) ?? parsed;
}

export async function pullPrimarySnapshot() {
  const here = placement();
  if (here.role !== "replica") return { ok: false as const, skipped: true as const };
  if (!here.primaryUrl || !here.fleetSecret) throw new ZendoError("Set ZENDO_PRIMARY_URL and ZENDO_FLEET_SECRET on a replica.");
  const response = await fetch(new URL("/api/fleet/snapshot", here.primaryUrl), {
    headers: { authorization: `Bearer ${here.fleetSecret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new ZendoError("The primary did not share the ledger.", 502);
  installSnapshot(await response.text());
  return { ok: true as const, skipped: false as const };
}

function blankFollower(state: State) {
  state.followerShard = true;
  state.shardExported = "0";
  state.shardImported = "0";
  state.outbox = [];
  state.shardReplay = [];
  state.users = [];
  state.pending = [];
  state.coins = [];
  state.txs = [];
  state.mempool = [];
  state.blocks = [];
  state.stakes = [];
  state.unbonding = [];
  state.proposals = [];
  state.notices = [];
  state.journal = [];
  state.issuedRewards = "0";
  for (const account of Object.values(state.accounts)) account.balances = {};
}

function z(value: string): bigint {
  try {
    return parseUnits(value, 18);
  } catch (error) {
    throw new ZendoError(error instanceof Error ? error.message : "Enter a ZCoin amount.");
  }
}

function tokens(value: string): bigint {
  try {
    return parseUnits(value, 6);
  } catch (error) {
    throw new ZendoError(error instanceof Error ? error.message : "Enter a token amount.");
  }
}

function gas(kind: keyof ReturnType<typeof getConfig>["gas"]): bigint {
  return z(getConfig().gas[kind]);
}

function mustAccount(state: State, address: string) {
  const account = state.accounts[address];
  if (!account) throw new ZendoError("That address is not on this chain.", 404);
  return account;
}

function credit(state: State, address: string, token: string, amount: bigint) {
  if (amount < 0n) throw new ZendoError("A credit went negative.", 500, "malformed");
  if (amount === 0n) return;
  const account = mustAccount(state, address);
  account.balances[token] = (BigInt(account.balances[token] || "0") + amount).toString();
}

function debit(state: State, address: string, token: string, amount: bigint, label: string) {
  if (amount < 0n) throw new ZendoError("A debit went negative.", 400, "malformed");
  if (amount === 0n) return;
  const account = mustAccount(state, address);
  const current = BigInt(account.balances[token] || "0");
  if (current < amount) throw new ZendoError(`Not enough ${label} in this wallet.`, 400, "insufficient");
  const next = current - amount;
  if (next === 0n) delete account.balances[token];
  else account.balances[token] = next.toString();
}

function addRev(state: State, key: keyof Revenue, amount: bigint) {
  if (amount <= 0n) return;
  state.revenue[key] = (BigInt(state.revenue[key]) + amount).toString();
}

function notify(state: State, userId: string | null, title: string, body: string, href: string) {
  if (!userId) return;
  state.notices.unshift({ id: nid("ntf"), userId, title, body, href, at: Date.now(), read: false });
  if (state.notices.length > 200) state.notices.length = 200;
}

function log(state: State, actor: string, action: string, detail: string) {
  state.audit.unshift({ id: nid("aud"), at: Date.now(), actor, action, detail });
  if (state.audit.length > 200) state.audit.length = 200;
}

function userByIdSync(state: State, id: string): User {
  const user = state.users.find((item) => item.id === id);
  if (!user) throw new ZendoError("Sign in to continue.", 401);
  if (user.banned) throw new ZendoError("This account is paused.", 403);
  return user;
}

function side(coin: Coin) {
  if (coin.venue === "pool") {
    return { z: BigInt(coin.poolZ), tokens: BigInt(coin.poolTokens), k: BigInt(coin.poolK) };
  }
  return { z: BigInt(coin.virtualZ), tokens: BigInt(coin.virtualTokens), k: BigInt(coin.k) };
}

function saveSide(coin: Coin, next: { z: bigint; tokens: bigint }) {
  if (coin.venue === "pool") {
    coin.poolZ = next.z.toString();
    coin.poolTokens = next.tokens.toString();
    return;
  }
  coin.virtualZ = next.z.toString();
  coin.virtualTokens = next.tokens.toString();
  const real = next.z - BigInt(coin.initialZ);
  coin.realZ = (real > 0n ? real : 0n).toString();
}

function remember(coin: Coin, trade: Coin["trades"][number]) {
  coin.trades.push(trade);
  if (coin.trades.length > 160) coin.trades.splice(0, coin.trades.length - 160);
}

function maybeGraduate(coin: Coin, at: number) {
  if (coin.venue !== "curve") return;
  const threshold = z(getConfig().graduationZ);
  const real = BigInt(coin.realZ);
  const sold = BigInt(coin.tokensSold);
  const sale = BigInt(coin.saleSupply);
  if (real < threshold && sold < sale) return;
  const poolTokens = BigInt(coin.totalSupply) - sold;
  if (real <= 0n || poolTokens <= 0n) return;
  coin.venue = "pool";
  coin.graduated = true;
  coin.graduatedAt = at;
  coin.poolZ = real.toString();
  coin.poolTokens = poolTokens.toString();
  coin.poolK = (real * poolTokens).toString();
}

function priceWith(coin: Coin, mode: "buy" | "sell", amount: bigint, mev: boolean): { quote: Quote; capped: boolean } {
  const cfg = getConfig();
  const tradeBps = BigInt(cfg.tradeBps + (mev ? 5 : 0));
  const creatorBps = BigInt(cfg.creatorBps);
  try {
    if (mode === "sell") return { quote: quoteSell(side(coin), amount, tradeBps, creatorBps), capped: false };
    if (coin.venue === "pool") return { quote: quoteBuy(side(coin), amount, tradeBps, creatorBps), capped: false };
    const remaining = BigInt(coin.saleSupply) - BigInt(coin.tokensSold);
    return capBuy(side(coin), amount, remaining, tradeBps, creatorBps);
  } catch (error) {
    throw new ZendoError(error instanceof Error ? error.message : "Could not price that trade.");
  }
}

function bookFees(state: State, coin: Coin, quote: Quote, gasFee: bigint) {
  credit(state, coin.creator, "ZCOIN", quote.creatorFee);
  credit(state, SYSTEM.treasury, "ZCOIN", quote.protocolFee + gasFee);
  coin.creatorFees = (BigInt(coin.creatorFees) + quote.creatorFee).toString();
  addRev(state, "trade", quote.protocolFee);
  addRev(state, "gas", gasFee);
  if (state.mevEnabled) addRev(state, "mev", (quote.grossZ * 5n) / 10_000n);
}

function applyBuy(state: State, coin: Coin, buyer: string, gross: bigint, at: number, opts?: { gas?: boolean }) {
  if (coin.hidden) throw new ZendoError("This coin is hidden.");
  const priced = priceWith(coin, "buy", gross, state.mevEnabled);
  const quote = priced.quote;
  const gasFee = opts?.gas === false ? 0n : gas("trade");
  debit(state, buyer, "ZCOIN", quote.grossZ + gasFee, "ZCoin");
  credit(state, buyer, coin.mint, quote.tokens);
  credit(state, coin.mint, "ZCOIN", quote.netZ);
  bookFees(state, coin, quote, gasFee);
  saveSide(coin, { z: quote.newZ, tokens: quote.newTokens });
  if (coin.venue === "curve") {
    coin.tokensSold = (BigInt(coin.tokensSold) + quote.tokens).toString();
    maybeGraduate(coin, at);
  }
  remember(coin, {
    id: nid("trd"),
    at,
    side: "buy",
    address: buyer,
    zBase: quote.grossZ.toString(),
    tokenBase: quote.tokens.toString(),
    price: priceNumber(quote.newZ, quote.newTokens),
  });
  const tx = pushTx(state, {
    at,
    type: "trade",
    from: buyer,
    to: coin.mint,
    token: coin.mint,
    symbol: coin.symbol,
    amount: quote.tokens.toString(),
    amountDisplay: formatToken(quote.tokens, 2),
    fee: (quote.fee + gasFee).toString(),
    feeDisplay: formatZ(quote.fee + gasFee, 4),
    summary: `Bought ${formatToken(quote.tokens, 2)} ${coin.symbol}`,
    gasUsed: 85_000,
  });
  return { quote, tx, capped: priced.capped };
}

function applySell(state: State, coin: Coin, seller: string, tokenIn: bigint, at: number, opts?: { gas?: boolean }) {
  if (coin.hidden) throw new ZendoError("This coin is hidden.");
  if (coin.venue === "curve" && tokenIn > BigInt(coin.tokensSold)) {
    throw new ZendoError("The curve cannot buy back more than it has sold.");
  }
  const priced = priceWith(coin, "sell", tokenIn, state.mevEnabled);
  const quote = priced.quote;
  const gasFee = opts?.gas === false ? 0n : gas("trade");
  if (quote.proceeds <= gasFee) throw new ZendoError("That sale does not cover the network fee.");
  debit(state, seller, coin.mint, tokenIn, coin.symbol);
  debit(state, coin.mint, "ZCOIN", quote.grossZ, "curve");
  credit(state, seller, "ZCOIN", quote.proceeds - gasFee);
  bookFees(state, coin, quote, gasFee);
  saveSide(coin, { z: quote.newZ, tokens: quote.newTokens });
  if (coin.venue === "curve") {
    const left = BigInt(coin.tokensSold) - tokenIn;
    coin.tokensSold = (left > 0n ? left : 0n).toString();
  }
  remember(coin, {
    id: nid("trd"),
    at,
    side: "sell",
    address: seller,
    zBase: quote.grossZ.toString(),
    tokenBase: tokenIn.toString(),
    price: priceNumber(quote.newZ, quote.newTokens),
  });
  const tx = pushTx(state, {
    at,
    type: "trade",
    from: seller,
    to: coin.mint,
    token: coin.mint,
    symbol: coin.symbol,
    amount: tokenIn.toString(),
    amountDisplay: formatToken(tokenIn, 2),
    fee: (quote.fee + gasFee).toString(),
    feeDisplay: formatZ(quote.fee + gasFee, 4),
    summary: `Sold ${formatToken(tokenIn, 2)} ${coin.symbol}`,
    gasUsed: 85_000,
  });
  return { quote, tx, capped: false };
}

function pushTx(state: State, input: Omit<Tx, "hash" | "height" | "status">): Tx {
  const tx: Tx = {
    ...input,
    hash: txHash(`${input.summary}:${input.at}:${input.from}`),
    height: null,
    status: "finalized",
  };
  state.mempool.push(tx);
  state.txs.push(tx);
  const from = state.accounts[input.from];
  if (from) from.nonce += 1;
  return tx;
}

function rootOf(state: State): string {
  const body = Object.values(state.accounts)
    .sort((a, b) => a.address.localeCompare(b.address))
    .map((account) => {
      const balances = Object.entries(account.balances)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join(",");
      return `${account.address}:${account.nonce}:${balances}`;
    })
    .join("|");
  return `0x${sha256(body)}`;
}

function nextProposer(state: State): Validator {
  const active = state.validators.filter((validator) => validator.status === "active");
  if (!active.length) throw new ZendoError("No active validators.", 500, "malformed");
  return active[(state.height + 1) % active.length];
}

function produceBlock(state: State, at: number) {
  const proposer = nextProposer(state);
  const previous = state.blocks[state.blocks.length - 1];
  const stamp = Math.max(at, (previous?.at ?? 0) + 1);
  if (!state.mempool.length) {
    pushTx(state, {
      at: stamp,
      type: "heartbeat",
      from: proposer.address,
      to: proposer.address,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: "0",
      amountDisplay: "0",
      fee: "0",
      feeDisplay: "0",
      summary: `${proposer.moniker} sealed the slot`,
      gasUsed: 21_000,
    });
  }
  const txs = state.mempool.splice(0, 40);
  const height = state.height + 1;
  const hash = `0x${sha256(`${height}|${state.parentHash}|${stamp}|${txs.map((tx) => tx.hash).join(",")}|${proposer.address}`)}`;
  for (const tx of txs) tx.height = height;
  state.blocks.push({
    height,
    hash,
    parent: state.parentHash,
    at: stamp,
    proposer: proposer.address,
    proposerName: proposer.moniker,
    txHashes: txs.map((tx) => tx.hash),
    gasUsed: txs.reduce((sum, tx) => sum + tx.gasUsed, 0),
    stateRoot: rootOf(state),
    pohSlot: getConfig().pohEnabled ? height : null,
  });
  state.height = height;
  state.parentHash = hash;
  state.lastBlockAt = stamp;
  proposer.proposed += 1;
  releaseUnbonding(state);
  if (state.blocks.length > 320) {
    state.blocks.splice(0, state.blocks.length - 320);
    const keep = new Set(state.blocks.flatMap((block) => block.txHashes));
    state.txs = state.txs.filter((tx) => keep.has(tx.hash) || tx.height === null);
  }
}

function releaseUnbonding(state: State): boolean {
  const ready = state.unbonding.filter((row) => state.height >= row.readyHeight);
  if (!ready.length) return false;
  for (const row of ready) credit(state, row.address, "ZCOIN", BigInt(row.amount));
  state.unbonding = state.unbonding.filter((row) => state.height < row.readyHeight);
  return true;
}

function refreshProposals(state: State): boolean {
  const now = Date.now();
  let changed = false;
  for (const proposal of state.proposals) {
    if (proposal.status !== "active" || now < proposal.endsAt) continue;
    let yes = 0n;
    let no = 0n;
    for (const vote of Object.values(proposal.votes)) {
      if (vote.choice === "yes") yes += BigInt(vote.weight);
      if (vote.choice === "no") no += BigInt(vote.weight);
    }
    const quorum = z("1000");
    const passed = yes + no >= quorum && yes > no;
    proposal.status = passed ? "passed" : "rejected";
    if (passed && proposal.change && !proposal.applied) {
      try {
        applyChainParam(state, proposal.change.key, proposal.change.value);
        proposal.applied = true;
        pushTx(state, {
          at: now,
          type: "param",
          from: proposal.author,
          to: SYSTEM.treasury,
          token: "ZCOIN",
          symbol: "ZCOIN",
          amount: "0",
          amountDisplay: "0",
          fee: "0",
          feeDisplay: "0",
          summary: `Applied ${proposal.change.key} = ${proposal.change.value}`,
          gasUsed: 25_000,
        });
      } catch {
        proposal.status = "rejected";
      }
    }
    changed = true;
  }
  return changed;
}

function applyChainParam(state: State, key: ParamKey, value: string) {
  const cfg = getConfig();
  const parsed = parseParam(key, value, { tradeBps: cfg.tradeBps, creatorBps: cfg.creatorBps });
  state.params = { ...state.params, ...parsed.patch };
  if (parsed.patch.mev !== undefined) state.mevEnabled = parsed.patch.mev;
  bindChainParams(state.params);
}

function releaseVested(state: State, now = Date.now()): boolean {
  const anchor = state.publicLaunchAt;
  if (anchor == null) return false;
  const cfg = getConfig();
  let paid = 0n;
  for (const founder of ZENDO_FOUNDERS) {
    const vesting = founderVestingAddress(founder.id);
    const wallet = founderWalletAddress(founder.id);
    const balance = BigInt(state.accounts[vesting]?.balances.ZCOIN || "0");
    const total = founderUnits(founder.amount);
    const vested = vestedAmount(total, anchor, now, cfg.cliffDays, cfg.vestingYears, cfg.yearlyUnlockBps);
    const already = BigInt(state.founderClaims[founder.id] || "0");
    const claimable = vested > already ? vested - already : 0n;
    const pay = claimable > balance ? balance : claimable;
    if (pay <= 0n) continue;
    debit(state, vesting, "ZCOIN", pay, "vesting");
    credit(state, wallet, "ZCOIN", pay);
    state.founderClaims[founder.id] = (already + pay).toString();
    state.vestingClaimed = (BigInt(state.vestingClaimed) + pay).toString();
    paid += pay;
    pushTx(state, {
      at: now,
      type: "vesting",
      from: vesting,
      to: wallet,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: pay.toString(),
      amountDisplay: formatZ(pay, 2),
      fee: "0",
      feeDisplay: "0",
      summary: `Released ${formatZ(pay, 2)} unlocked ZendoCoin to ${founder.name}`,
      gasUsed: 45_000,
    });
  }
  if (paid <= 0n) return false;
  produceBlock(state, now);
  log(state, "chain", "vesting.release", formatZ(paid, 2));
  return true;
}

function housekeeping(state: State): boolean {
  const vested = releaseVested(state);
  const released = releaseUnbonding(state);
  const proposals = refreshProposals(state);
  const now = Date.now();
  const pendingBefore = state.pending.length;
  state.pending = state.pending.filter((row) => row.expires > now);
  const expired = state.pending.length !== pendingBefore;
  if (process.env.ZENDO_DISABLE_TIMER === "1") return vested || released || proposals || expired;
  if (now - state.lastBlockAt < getConfig().blockTimeMs) return vested || released || proposals;
  produceBlock(state, now);
  return true;
}

function findCoin(state: State, mint: string): Coin {
  const coin = state.coins.find((item) => item.mint === mint);
  if (!coin || coin.hidden) throw new ZendoError("Coin not found.", 404);
  return coin;
}

function mintCoin(
  state: State,
  input: { creator: string; creatorUserId: string | null; name: string; symbol: string; description: string; emoji: string; hue: number; at: number; fee: boolean; boost: number },
): Coin {
  if (!getConfig().features.launchpad) throw new ZendoError("The launchpad is switched off.");
  if (state.coins.some((coin) => coin.symbol === input.symbol)) throw new ZendoError("That ticker is already taken.");
  const fee = input.fee ? gas("createCoin") : 0n;
  if (fee > 0n) {
    debit(state, input.creator, "ZCOIN", fee, "ZCoin");
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "create", fee);
  }
  const cfg = getConfig();
  const initialZ = z(cfg.virtualZ);
  const virtualTokens = tokens(cfg.virtualTokens);
  const coin: Coin = {
    mint: addressFromLabel(`coin:${input.symbol}:${input.creator}`),
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    emoji: input.emoji,
    hue: input.hue,
    creator: input.creator,
    creatorUserId: input.creatorUserId,
    createdAt: input.at,
    hidden: false,
    featuredUntil: 0,
    venue: "curve",
    graduated: false,
    graduatedAt: null,
    initialZ: initialZ.toString(),
    virtualZ: initialZ.toString(),
    virtualTokens: virtualTokens.toString(),
    k: (initialZ * virtualTokens).toString(),
    realZ: "0",
    tokensSold: "0",
    saleSupply: tokens(cfg.saleTokens).toString(),
    totalSupply: tokens(cfg.totalTokens).toString(),
    poolZ: "0",
    poolTokens: "0",
    poolK: "0",
    creatorFees: "0",
    boost: input.boost,
    promotions: [],
    votes: {},
    replies: [],
    trades: [],
  };
  state.accounts[coin.mint] = {
    address: coin.mint,
    userId: null,
    label: `${coin.symbol} curve`,
    balances: {},
    nonce: 0,
  };
  state.coins.unshift(coin);
  pushTx(state, {
    at: input.at,
    type: "coin_create",
    from: input.creator,
    to: coin.mint,
    token: "ZCOIN",
    symbol: coin.symbol,
    amount: fee.toString(),
    amountDisplay: formatZ(fee, 4),
    fee: fee.toString(),
    feeDisplay: formatZ(fee, 4),
    summary: `Created ${coin.name} ($${coin.symbol})`,
    gasUsed: 120_000,
  });
  return coin;
}

function bootstrap(state: State) {
  produceBlock(state, Date.now());
  state.lastBlockAt = Date.now();
}

function quoteInternal(state: State, coin: Coin, mode: "buy" | "sell", amount: string): QuoteView {
  const parsed = mode === "buy" ? z(amount) : tokens(amount);
  const gasFee = gas("trade");
  const priced = priceWith(coin, mode, parsed, state.mevEnabled);
  const proceeds = mode === "sell" ? priced.quote.proceeds - gasFee : 0n;
  if (mode === "sell" && proceeds <= 0n) throw new ZendoError("That sale does not cover the network fee.");
  return presentQuote({
    side: mode,
    capped: priced.capped,
    gross: priced.quote.grossZ,
    tokens: mode === "buy" ? priced.quote.tokens : parsed,
    fee: priced.quote.fee,
    creatorFee: priced.quote.creatorFee,
    protocolFee: priced.quote.protocolFee,
    gas: gasFee,
    proceeds: mode === "sell" ? proceeds : priced.quote.grossZ,
    price: priced.quote.priceAfter,
    impact: impactPct(priced.quote.priceBefore, priced.quote.priceAfter),
    graduated: coin.graduated,
  });
}

function powerOf(state: State, address: string): bigint {
  const liquid = BigInt(state.accounts[address]?.balances.ZCOIN || "0");
  const staked = state.stakes.filter((stake) => stake.address === address).reduce((sum, stake) => sum + BigInt(stake.amount), 0n);
  return liquid + staked;
}

function payReward(state: State, address: string, validator: Validator | undefined, gross: bigint) {
  if (gross <= 0n) return 0n;
  const pool = BigInt(state.accounts[SYSTEM.treasury]?.balances.ZCOIN || "0");
  const payable = gross > pool ? pool : gross;
  if (payable <= 0n) return 0n;
  const split = splitReward(payable, validator?.commissionBps ?? 0);
  debit(state, SYSTEM.treasury, "ZCOIN", payable, "ZCoin");
  credit(state, address, "ZCOIN", split.net);
  if (validator && split.commission > 0n) credit(state, validator.address, "ZCOIN", split.commission);
  state.issuedRewards = (BigInt(state.issuedRewards) + payable).toString();
  return split.net;
}

function harvest(stake: State["stakes"][number], now: number): bigint {
  const gross = pendingReward(BigInt(stake.amount), BigInt(stake.accrued), stake.rewardsSettledAt, now, getConfig().aprBps);
  stake.accrued = "0";
  stake.rewardsSettledAt = now;
  return gross;
}

export const home = () => view((state) => presentHome(state));
export const status = () => {
  const current = slot();
  if (current.statusValue && current.statusAt && Date.now() - current.statusAt < 800) {
    return Promise.resolve(current.statusValue);
  }
  return view((state) => {
    const value = presentStatus(state);
    const live = slot();
    live.statusValue = value;
    live.statusAt = Date.now();
    return value;
  });
};
export const liveFeed = () =>
  view((state) => ({
    chain: {
      networkId: state.networkId,
      height: state.height,
      coins: state.coins.filter((coin) => !coin.hidden).length,
      accounts: Object.keys(state.accounts).length,
    },
    prices: state.coins.filter((coin) => !coin.hidden).slice(0, 12).map((coin) => ({
      symbol: coin.symbol,
      mint: coin.mint,
      price: coin.trades.length ? coin.trades[coin.trades.length - 1].price : 0,
    })),
    trades: state.txs.filter((tx) => tx.type === "transfer" || tx.type === "trade").slice(0, 8).map((tx) => ({
      hash: tx.hash,
      summary: tx.summary,
    })),
    books: state.coins.filter((coin) => !coin.hidden).slice(0, 12).map((coin) => ({
      symbol: coin.symbol,
      mint: coin.mint,
      venue: coin.venue,
      realZ: coin.realZ,
      price: coin.trades.length ? coin.trades[coin.trades.length - 1].price : 0,
    })),
  }));
export const fees = () => view(() => presentFees());
export const stats = () => view((state) => presentStats(state));
export const zcoin = () => view((state) => presentZcoin(state));
export const validatorList = () => view((state) => presentValidators(state));
export const contractList = () => view((state) => contracts(state));
export const staking = (userId: string | null) =>
  view((state) => ({
    validators: presentValidators(state),
    wallet: userId ? presentWallet(state, userByIdSync(state, userId)) : null,
    apr: getConfig().aprBps / 100,
    unbondingBlocks: getConfig().unbondingBlocks,
  }));

export const blocks = (limit = 20) =>
  view((state) => state.blocks.slice(-Math.max(1, Math.min(50, limit))).reverse().map((block) => presentBlock(state, block)));

export const transactions = (limit = 40) =>
  view((state) => state.txs.slice(-Math.max(1, Math.min(80, limit))).reverse().map((tx) => presentTx(state, tx)));

export const accountIndex = () => accountPage(1).then((page) => page.rows);

const PAGE_SIZE = 24;

export type Page<T> = { page: number; pages: number; total: number; rows: T[] };

function slicePage<T>(rows: T[], page: number): Page<T> {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);
  const current = Number.isFinite(page) ? Math.min(Math.max(1, Math.floor(page)), pages) : 1;
  const start = (current - 1) * PAGE_SIZE;
  return { page: current, pages, total: rows.length, rows: rows.slice(start, start + PAGE_SIZE) };
}

export const blockPage = (page = 1) =>
  view((state) => {
    const total = state.blocks.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    const current = Number.isFinite(page) ? Math.min(Math.max(1, Math.floor(page)), pages) : 1;
    const end = total - (current - 1) * PAGE_SIZE;
    const start = Math.max(0, end - PAGE_SIZE);
    return {
      page: current,
      pages,
      total,
      rows: state.blocks.slice(start, end).reverse().map((block) => presentBlock(state, block)),
    };
  });

export const transactionPage = (page = 1) =>
  view((state) => {
    const total = state.txs.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    const current = Number.isFinite(page) ? Math.min(Math.max(1, Math.floor(page)), pages) : 1;
    const end = total - (current - 1) * PAGE_SIZE;
    const start = Math.max(0, end - PAGE_SIZE);
    return {
      page: current,
      pages,
      total,
      rows: state.txs.slice(start, end).reverse().map((tx) => presentTx(state, tx)),
    };
  });

export const accountPage = (page = 1) =>
  view((state) =>
    slicePage(
      Object.values(state.accounts)
        .map((account) => ({
          address: account.address,
          name: account.label,
          zcoin: formatZ(BigInt(account.balances.ZCOIN || "0"), 4),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      page,
    ),
  );

export const block = (height: number) =>
  view((state) => {
    const found = state.blocks.find((item) => item.height === height);
    if (!found) throw new ZendoError("Block not found.", 404);
    return presentBlockDetail(state, found);
  });

export const transaction = (hash: string) =>
  view((state) => {
    const found = state.txs.find((item) => item.hash === hash);
    if (!found) throw new ZendoError("Transaction not found.", 404);
    const included = found.height === null ? null : state.blocks.find((item) => item.height === found.height) || null;
    return { tx: presentTx(state, found), block: included ? presentBlock(state, included) : null };
  });

export const address = (addr: string) =>
  view((state) => {
    const detail = presentAddress(state, addressOf(addr));
    if (!detail) throw new ZendoError("Address not found.", 404);
    return detail;
  });

export const search = (query: string) =>
  view((state) => {
    const href = exactHref(state, query);
    return href ? { href } : null;
  });

export const suggest = (query: string, kind = "all", limit = 8) =>
  view((state) => {
    const href = exactHref(state, query);
    return { hits: collectHits(state, query, kind, limit), exact: href ? { href } : null };
  });

export const socialProfile = (id: string, viewerId: string | null) => view((state) => profileOf(state, id, viewerId));

export const socialFeed = (viewerId: string | null) => view((state) => feedOf(state, viewerId));

export const socialInbox = (userId: string) => view((state) => inboxOf(state, userId));

export const socialAnalytics = (userId: string) => view((state) => analyticsOf(state, userId));

export const followAccount = (userId: string, targetId: string) =>
  mutate((state) => {
    applyFollow(state, userId, targetId);
    return profileOf(state, targetId, userId);
  });

export const unfollowAccount = (userId: string, targetId: string) =>
  mutate((state) => {
    applyUnfollow(state, userId, targetId);
    return profileOf(state, targetId, userId);
  });

export const publishPost = (userId: string, body: unknown) =>
  mutate((state) => {
    applyPost(state, userId, body);
    return feedOf(state, userId);
  });

export const publishStory = (userId: string, caption: unknown) =>
  mutate((state) => {
    applyStory(state, userId, caption);
    return feedOf(state, userId);
  });

export const publishVideo = (userId: string, title: unknown, caption: unknown) =>
  mutate((state) => {
    applyVideo(state, userId, title, caption);
    return feedOf(state, userId);
  });

export const createCircle = (userId: string, name: unknown, memberIds: unknown) =>
  mutate((state) => {
    applyCircle(state, userId, name, memberIds);
    return feedOf(state, userId);
  });

export const sendDirect = (userId: string, targetId: string, body: unknown) =>
  mutate((state) => {
    applyMessage(state, userId, targetId, body);
    return inboxOf(state, userId);
  });

export const coins = (sort = "trending", q = "") =>
  view((state) => {
    const now = Date.now();
    const query = q.trim().toLowerCase();
    let list = state.coins.filter((coin) => !coin.hidden);
    if (query) {
      list = list.filter((coin) => coin.name.toLowerCase().includes(query) || coin.symbol.toLowerCase().includes(query) || coin.mint.includes(query));
    }
    list.sort((a, b) => {
      if (sort === "new") return b.createdAt - a.createdAt;
      if (sort === "graduating") return Number(b.realZ) - Number(a.realZ) || Number(!b.graduated) - Number(!a.graduated);
      if (sort === "volume") {
        const vol = (coin: Coin) => coin.trades.reduce((sum, trade) => sum + Number(trade.zBase.slice(0, 12)), 0);
        return vol(b) - vol(a);
      }
      return coinScore(b, now) - coinScore(a, now);
    });
    return list.slice(0, 48).map((coin) => presentCoin(state, coin, now));
  });

export const coin = (mint: string, userId: string | null) =>
  view((state) => {
    const found = state.coins.find((item) => item.mint === mint);
    if (!found) throw new ZendoError("Coin not found.", 404);
    const viewer = userId ? state.users.find((item) => item.id === userId) || null : null;
    if (found.hidden && viewer?.role !== "admin" && viewer?.address !== found.creator) {
      throw new ZendoError("Coin not found.", 404);
    }
    return presentCoinDetail(state, found, viewer);
  });

export const quote = (mint: string, mode: unknown, amount: unknown) =>
  view((state) => quoteInternal(state, findCoin(state, mint), sideOf(mode), textOf(amount, "An amount", 1, 40)));

export const swap = (userId: string, mint: string, mode: unknown, amount: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const found = findCoin(state, mint);
    const sideName = sideOf(mode);
    const raw = textOf(amount, "An amount", 1, 40);
    const result = sideName === "buy" ? applyBuy(state, found, user.address, z(raw), Date.now()) : applySell(state, found, user.address, tokens(raw), Date.now());
    produceBlock(state, Date.now());
    notify(state, user.id, result.tx.summary, `${found.name} on the ${found.venue === "pool" ? "pool" : "curve"}.`, `/launchpad/${found.mint}`);
    void publishJob("launchpad-trade", { hash: result.tx.hash, mint: found.mint, side: sideName });
    return { tx: presentTx(state, result.tx), coin: presentCoinDetail(state, found, user), capped: result.capped };
  });

export const createCoin = (userId: string, input: Record<string, unknown>) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const coin = mintCoin(state, {
      creator: user.address,
      creatorUserId: user.id,
      name: nameOf(input.name),
      symbol: symbolOf(input.symbol),
      description: textOf(input.description, "A description", 10, 280),
      emoji: emojiOf(input.emoji),
      hue: hueOf(input.hue),
      at: Date.now(),
      fee: true,
      boost: user.referredBy ? 15 : 0,
    });
    produceBlock(state, Date.now());
    notify(state, user.id, `${coin.symbol} is live`, "The curve is open. The first trade sets the chart.", `/launchpad/${coin.mint}`);
    void cacheSet(`coin:${coin.mint}`, coin.symbol, 30);
    void publishJob("coin-create", { mint: coin.mint, symbol: coin.symbol });
    return presentCoinDetail(state, coin, user);
  });

export const reply = (userId: string, mint: string, body: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const found = findCoin(state, mint);
    found.replies.push({ id: nid("rpl"), at: Date.now(), address: user.address, name: user.displayName, body: textOf(body, "A reply", 1, 280) });
    if (found.replies.length > 100) found.replies.splice(0, found.replies.length - 100);
    return presentCoinDetail(state, found, user);
  });

export const voteCoin = (userId: string, mint: string, direction: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const found = findCoin(state, mint);
    if (direction !== "up" && direction !== "down" && direction !== "clear") throw new ZendoError("Vote up or down.");
    if (direction === "clear") delete found.votes[user.address];
    else found.votes[user.address] = direction === "up" ? 1 : -1;
    return presentCoinDetail(state, found, user);
  });

export const report = (userId: string, mint: string, reason: unknown, detail: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const found = findCoin(state, mint);
    const allowed = ["Scam", "Spam", "Impersonation", "Other"];
    if (typeof reason !== "string" || !allowed.includes(reason)) throw new ZendoError("Pick a report reason.");
    state.reports.unshift({
      id: nid("rpt"),
      at: Date.now(),
      mint: found.mint,
      address: user.address,
      reason,
      detail: typeof detail === "string" ? detail.trim().slice(0, 280) : "",
      open: true,
    });
    return { ok: true };
  });

export const promote = (userId: string, mint: string) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const found = findCoin(state, mint);
    if (found.creator !== user.address && user.role !== "admin") throw new ZendoError("Only the creator can promote this coin.");
    const fee = gas("promote");
    debit(state, user.address, "ZCOIN", fee, "ZCoin");
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "promote", fee);
    const start = Math.max(Date.now(), found.featuredUntil);
    found.featuredUntil = start + 24 * 60 * 60 * 1000;
    if (!Array.isArray(found.promotions)) found.promotions = [];
    found.promotions.unshift({ at: Date.now(), until: found.featuredUntil, by: user.address });
    if (found.promotions.length > 20) found.promotions.length = 20;
    pushTx(state, {
      at: Date.now(),
      type: "promote",
      from: user.address,
      to: found.mint,
      token: "ZCOIN",
      symbol: found.symbol,
      amount: fee.toString(),
      amountDisplay: formatZ(fee, 2),
      fee: fee.toString(),
      feeDisplay: formatZ(fee, 2),
      summary: `Promoted ${found.symbol} for 24 hours`,
      gasUsed: 40_000,
    });
    produceBlock(state, Date.now());
    return presentCoinDetail(state, found, user);
  });

export const wallet = (userId: string) => view((state) => presentWallet(state, userByIdSync(state, userId)));

export const send = (userId: string, to: unknown, token: unknown, amount: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (!ownsAccount(user.address)) throw new ZendoError("This account writes on another shard.");
    const dest = addressOf(to);
    if (dest === user.address) throw new ZendoError("Choose a different recipient.");
    if (!state.accounts[dest]) {
      state.accounts[dest] = { address: dest, userId: null, label: "External wallet", balances: {}, nonce: 0 };
    }
    const asset = resolveToken(state, token);
    const value = asset.decimals === 18 ? z(textOf(amount, "An amount", 1, 40)) : tokens(textOf(amount, "An amount", 1, 40));
    if (value <= 0n) throw new ZendoError("Enter an amount greater than zero.");
    const fee = gas("transfer");
    debit(state, user.address, asset.id, value, asset.symbol);
    if (asset.id === "ZCOIN") debit(state, user.address, "ZCOIN", fee, "ZCoin");
    else debit(state, user.address, "ZCOIN", fee, "ZCoin");
    const here = placement();
    const foreign = here.count > 1 && shardOf(dest, here.count) !== here.index;
    if (foreign) {
      if (state.outbox.length >= OUTBOX_CAP) throw new ZendoError("This shard is waiting for another shard to accept receipts.");
      state.outbox.push(signReceipt(
        {
          id: nid("shr"),
          fromShard: here.index,
          toShard: shardOf(dest, here.count),
          to: dest,
          asset: asset.id,
          amount: value.toString(),
        },
        here.secret,
      ));
      state.shardExported = (BigInt(state.shardExported || "0") + value).toString();
    } else {
      credit(state, dest, asset.id, value);
    }
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    postTransfer(state, user.address, dest, asset.id, value);
    postTransfer(state, user.address, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "gas", fee);
    const tx = pushTx(state, {
      at: Date.now(),
      type: "transfer",
      from: user.address,
      to: dest,
      token: asset.id,
      symbol: asset.symbol,
      amount: value.toString(),
      amountDisplay: asset.decimals === 18 ? formatZ(value, 4) : formatToken(value, 4),
      fee: fee.toString(),
      feeDisplay: formatZ(fee, 4),
      summary: `Sent ${asset.decimals === 18 ? formatZ(value, 4) : formatToken(value, 4)} ${asset.symbol} to ${labelOf(state, dest)}`,
      gasUsed: 21_000,
    });
    produceBlock(state, Date.now());
    notify(state, user.id, "Transfer included", tx.summary, `/explorer/tx/${tx.hash}`);
    const recipient = state.users.find((item) => item.address === dest);
    notify(state, recipient?.id ?? null, "Transfer received", tx.summary, `/explorer/tx/${tx.hash}`);
    return presentTx(state, tx);
  });

function resolveToken(state: State, token: unknown): { id: string; symbol: string; decimals: number } {
  if (typeof token !== "string" || !token.trim()) throw new ZendoError("Choose a token.");
  if (token.toUpperCase() === "ZCOIN") return { id: "ZCOIN", symbol: "ZCOIN", decimals: 18 };
  const coin = state.coins.find((item) => item.mint === token || item.symbol === token.toUpperCase());
  if (!coin) throw new ZendoError("Unknown token.");
  return { id: coin.mint, symbol: coin.symbol, decimals: 6 };
}

export const delegate = (userId: string, validatorId: unknown, amount: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (typeof validatorId !== "string") throw new ZendoError("Choose a validator.");
    const validator = state.validators.find((item) => item.id === validatorId);
    if (!validator || validator.status !== "active") throw new ZendoError("That validator is not in the active set.");
    const value = z(textOf(amount, "An amount", 1, 40));
    if (value < z(getConfig().minDelegate)) throw new ZendoError(`Delegate at least ${getConfig().minDelegate} ZCoin.`);
    const fee = gas("stake");
    debit(state, user.address, "ZCOIN", value + fee, "ZCoin");
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "gas", fee);
    const now = Date.now();
    const existing = state.stakes.find((stake) => stake.address === user.address && stake.validatorId === validator.id);
    if (existing) {
      existing.accrued = harvest(existing, now).toString();
      existing.amount = (BigInt(existing.amount) + value).toString();
    } else {
      state.stakes.push({
        id: nid("stk"),
        address: user.address,
        validatorId: validator.id,
        amount: value.toString(),
        rewardsSettledAt: now,
        accrued: "0",
      });
    }
    pushTx(state, {
      at: now,
      type: "stake",
      from: user.address,
      to: validator.address,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: value.toString(),
      amountDisplay: formatZ(value, 4),
      fee: fee.toString(),
      feeDisplay: formatZ(fee, 4),
      summary: `Delegated ${formatZ(value, 4)} ZCoin to ${validator.moniker}`,
      gasUsed: 55_000,
    });
    produceBlock(state, now);
    return presentWallet(state, user);
  });

export const undelegate = (userId: string, stakeId: unknown, amount: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (typeof stakeId !== "string") throw new ZendoError("Choose a delegation.");
    const stake = state.stakes.find((item) => item.id === stakeId && item.address === user.address);
    if (!stake) throw new ZendoError("Delegation not found.", 404);
    const value = z(textOf(amount, "An amount", 1, 40));
    if (value > BigInt(stake.amount)) throw new ZendoError("That is more than this delegation.", 400, "insufficient");
    const now = Date.now();
    const gross = harvest(stake, now);
    const left = BigInt(stake.amount) - value;
    const validator = state.validators.find((item) => item.id === stake.validatorId);
    if (left === 0n) {
      if (gross > 0n) payReward(state, user.address, validator, gross);
      state.stakes = state.stakes.filter((item) => item.id !== stake.id);
    } else {
      stake.accrued = gross.toString();
      stake.amount = left.toString();
    }
    state.unbonding.push({ id: nid("unb"), address: user.address, amount: value.toString(), readyHeight: state.height + getConfig().unbondingBlocks });
    pushTx(state, {
      at: now,
      type: "unstake",
      from: user.address,
      to: user.address,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: value.toString(),
      amountDisplay: formatZ(value, 4),
      fee: "0",
      feeDisplay: "0",
      summary: `Unbonding ${formatZ(value, 4)} ZCoin`,
      gasUsed: 40_000,
    });
    produceBlock(state, now);
    return presentWallet(state, user);
  });

export const claim = (userId: string, stakeId: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const now = Date.now();
    const rows = state.stakes.filter((stake) => stake.address === user.address && (stakeId === "all" || stake.id === stakeId));
    if (!rows.length) throw new ZendoError("Nothing to claim.");
    let netTotal = 0n;
    for (const stake of rows) {
      const validator = state.validators.find((item) => item.id === stake.validatorId);
      if (validator?.status === "jailed") continue;
      const gross = harvest(stake, now);
      if (gross <= 0n) continue;
      netTotal += payReward(state, user.address, validator, gross);
    }
    if (netTotal <= 0n) throw new ZendoError("Rewards are still dust. Give the epoch a moment.");
    pushTx(state, {
      at: now,
      type: "reward",
      from: SYSTEM.treasury,
      to: user.address,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: netTotal.toString(),
      amountDisplay: formatZ(netTotal, 6),
      fee: "0",
      feeDisplay: "0",
      summary: `Claimed ${formatZ(netTotal, 6)} ZCoin in staking rewards`,
      gasUsed: 30_000,
    });
    produceBlock(state, now);
    notify(state, user.id, "Rewards claimed", `+${formatZ(netTotal, 6)} ZCoin`, "/app/stake");
    return presentWallet(state, user);
  });

export const proposals = (userId: string | null) =>
  view((state) => presentProposals(state, userId ? state.users.find((item) => item.id === userId) || null : null));

export const propose = (userId: string, title: unknown, body: unknown, change: unknown) =>
  mutate((state) => {
    if (!getConfig().features.governance) throw new ZendoError("Governance is switched off.");
    const user = userByIdSync(state, userId);
    if (powerOf(state, user.address) < z("100")) throw new ZendoError("You need at least 100 ZCoin of voting power to propose.");
    const raw = change && typeof change === "object" ? (change as { key?: unknown; value?: unknown }) : null;
    let parsed;
    try {
      parsed = parseParam(String(raw?.key || ""), raw?.value, { tradeBps: getConfig().tradeBps, creatorBps: getConfig().creatorBps });
    } catch (error) {
      throw new ZendoError(error instanceof Error ? error.message : "That parameter is not allowed.");
    }
    const key = String(raw?.key || "");
    if (state.proposals.some((item) => item.status === "active" && item.change?.key === key)) {
      throw new ZendoError("An active proposal already changes that parameter.");
    }
    const nextTitle = textOf(title, "A title", 8, 90);
    if (state.proposals.some((item) => item.status === "active" && item.title.toLowerCase() === nextTitle.toLowerCase())) {
      throw new ZendoError("An active proposal already uses that title.");
    }
    const fee = gas("proposal");
    debit(state, user.address, "ZCOIN", fee, "ZCoin");
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "gas", fee);
    const now = Date.now();
    const proposal = {
      id: nid("prop"),
      title: nextTitle,
      body: textOf(body, "A proposal", 20, 800),
      author: user.address,
      authorName: user.displayName,
      createdAt: now,
      endsAt: now + 5 * 24 * 60 * 60 * 1000,
      status: "active" as const,
      votes: {},
      change: { key: String(raw?.key) as ParamKey, value: String(raw?.value).trim() },
      applied: false,
    };
    void parsed;
    state.proposals.unshift(proposal);
    pushTx(state, {
      at: now,
      type: "proposal",
      from: user.address,
      to: SYSTEM.treasury,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: fee.toString(),
      amountDisplay: formatZ(fee, 4),
      fee: fee.toString(),
      feeDisplay: formatZ(fee, 4),
      summary: `Proposed ${proposal.change.key} = ${proposal.change.value}`,
      gasUsed: 45_000,
    });
    produceBlock(state, now);
    return presentProposals(state, user);
  });

export const voteProposal = (userId: string, id: unknown, choice: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (typeof id !== "string") throw new ZendoError("Missing proposal.");
    const proposal = state.proposals.find((item) => item.id === id);
    if (!proposal || proposal.status !== "active" || Date.now() >= proposal.endsAt) throw new ZendoError("That proposal is closed.");
    const weight = powerOf(state, user.address);
    if (weight <= 0n) throw new ZendoError("You need ZCoin to vote.");
    proposal.votes[user.address] = { choice: choiceOf(choice), weight: weight.toString() };
    const fee = gas("vote");
    debit(state, user.address, "ZCOIN", fee, "ZCoin");
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "gas", fee);
    pushTx(state, {
      at: Date.now(),
      type: "vote",
      from: user.address,
      to: SYSTEM.community,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: weight.toString(),
      amountDisplay: formatZ(weight, 2),
      fee: fee.toString(),
      feeDisplay: formatZ(fee, 4),
      summary: `Voted ${choiceOf(choice)} on “${proposal.title}”`,
      gasUsed: 40_000,
    });
    produceBlock(state, Date.now());
    return presentProposals(state, user);
  });

function grantLockMs(): number {
  return process.env.ZENDO_DISABLE_TIMER === "1" ? 0 : 60_000;
}

function grantTally(grant: { votes: Record<string, { choice: "yes" | "no"; weight: string }> }) {
  let yes = 0n;
  let no = 0n;
  for (const vote of Object.values(grant.votes)) {
    if (vote.choice === "yes") yes += BigInt(vote.weight);
    else no += BigInt(vote.weight);
  }
  return { yes, no, passed: yes + no >= z("1000") && yes > no };
}

export const grants = (userId: string | null) =>
  view((state) => presentGrants(state, userId ? state.users.find((item) => item.id === userId) || null : null, grantLockMs()));

export const applyGrant = (userId: string, input: Record<string, unknown>) =>
  mutate((state) => {
    if (!getConfig().features.governance) throw new ZendoError("Governance is switched off.");
    const user = userByIdSync(state, userId);
    if (powerOf(state, user.address) < z("100")) throw new ZendoError("You need at least 100 ZCoin of voting power to apply.");
    const amount = z(textOf(input.amount, "An amount", 1, 40));
    if (amount < z("1") || amount > z("5000")) throw new ZendoError("A grant is between 1 and 5,000 ZCoin.");
    const treasury = BigInt(state.accounts[SYSTEM.treasury]?.balances.ZCOIN || "0");
    if (amount > treasury) throw new ZendoError("The treasury cannot cover that amount.");
    const fee = gas("proposal");
    debit(state, user.address, "ZCOIN", fee, "ZCoin");
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "gas", fee);
    const now = Date.now();
    state.grants.unshift({
      id: nid("grn"),
      title: textOf(input.title, "A title", 8, 90),
      body: textOf(input.body, "A description", 20, 800),
      milestone: textOf(input.milestone, "A milestone", 10, 200),
      amount: amount.toString(),
      author: user.address,
      authorName: user.displayName,
      createdAt: now,
      unlockAt: now + grantLockMs(),
      status: "active",
      paidAt: null,
      votes: {},
    });
    produceBlock(state, now);
    log(state, user.email, "grant.apply", `${state.grants[0].id} ${formatZ(amount, 2)}`);
    return presentGrants(state, user, grantLockMs());
  });

export const voteGrant = (userId: string, id: unknown, choice: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (typeof id !== "string") throw new ZendoError("Missing grant.");
    const grant = state.grants.find((item) => item.id === id);
    if (!grant || grant.status !== "active") throw new ZendoError("That grant is closed.");
    const weight = powerOf(state, user.address);
    if (weight <= 0n) throw new ZendoError("You need ZCoin to vote.");
    const side = choice === "no" ? "no" : choice === "yes" ? "yes" : null;
    if (!side) throw new ZendoError("Vote yes or no.");
    grant.votes[user.address] = { choice: side, weight: weight.toString() };
    const fee = gas("vote");
    debit(state, user.address, "ZCOIN", fee, "ZCoin");
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "gas", fee);
    const now = Date.now();
    pushTx(state, {
      at: now,
      type: "vote",
      from: user.address,
      to: SYSTEM.treasury,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: weight.toString(),
      amountDisplay: formatZ(weight, 2),
      fee: fee.toString(),
      feeDisplay: formatZ(fee, 4),
      summary: `Voted ${side} on grant “${grant.title}”`,
      gasUsed: 40_000,
    });
    produceBlock(state, now);
    return presentGrants(state, user, grantLockMs());
  });

export const payoutGrant = (userId: string, id: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (typeof id !== "string") throw new ZendoError("Missing grant.");
    const grant = state.grants.find((item) => item.id === id);
    if (!grant || grant.status !== "active") throw new ZendoError("That grant is closed.");
    const now = Date.now();
    if (now < grant.unlockAt) throw new ZendoError("This grant is still time-locked.");
    if (!grantTally(grant).passed) throw new ZendoError("Yes votes have not cleared 1,000 ZCoin.");
    const amount = BigInt(grant.amount);
    debit(state, SYSTEM.treasury, "ZCOIN", amount, "treasury");
    credit(state, grant.author, "ZCOIN", amount);
    grant.status = "paid";
    grant.paidAt = now;
    pushTx(state, {
      at: now,
      type: "grant",
      from: SYSTEM.treasury,
      to: grant.author,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: amount.toString(),
      amountDisplay: formatZ(amount, 2),
      fee: "0",
      feeDisplay: "0",
      summary: `Paid ${formatZ(amount, 2)} ZCoin for “${grant.milestone}”`,
      gasUsed: 35_000,
    });
    produceBlock(state, now);
    log(state, user.email, "grant.pay", grant.id);
    const author = state.users.find((item) => item.address === grant.author);
    notify(state, author?.id ?? null, "Grant paid", `${formatZ(amount, 2)} ZCoin from the treasury.`, "/grants");
    return presentGrants(state, user, grantLockMs());
  });

export const market = (userId: string | null) =>
  view((state) => presentMarket(state, userId ? state.users.find((item) => item.id === userId) || null : null));

export const publishListing = (userId: string, input: Record<string, unknown>) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const kind = input.kind === "sdk" || input.kind === "app" || input.kind === "contract" ? input.kind : null;
    if (!kind) throw new ZendoError("Pick contract, sdk, or app.");
    const fee = gas("proposal");
    debit(state, user.address, "ZCOIN", fee, "ZCoin");
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "gas", fee);
    const now = Date.now();
    state.listings.unshift({
      id: nid("mod"),
      name: textOf(input.name, "A name", 3, 40),
      summary: textOf(input.summary, "A summary", 20, 280),
      kind,
      author: user.address,
      authorName: user.displayName,
      createdAt: now,
      ratings: {},
    });
    pushTx(state, {
      at: now,
      type: "listing",
      from: user.address,
      to: SYSTEM.treasury,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: fee.toString(),
      amountDisplay: formatZ(fee, 4),
      fee: fee.toString(),
      feeDisplay: formatZ(fee, 4),
      summary: `Listed ${state.listings[0].name} on the marketplace`,
      gasUsed: 30_000,
    });
    produceBlock(state, now);
    log(state, user.email, "market.publish", state.listings[0].id);
    return presentMarket(state, user);
  });

export const applyReferral = (userId: string, code: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.referredBy) throw new ZendoError("This account already used a referral code.");
    const target = referralTarget(state, code, user.email);
    if (!target) throw new ZendoError("That referral code is not on this chain.");
    user.referredBy = target;
    const now = Date.now();
    pushTx(state, {
      at: now,
      type: "referral",
      from: user.address,
      to: user.address,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: "0",
      amountDisplay: "0",
      fee: "0",
      feeDisplay: "0",
      summary: `${user.displayName} attached a referral code`,
      gasUsed: 8_000,
    });
    produceBlock(state, now);
    notify(state, target, "Referral joined", `${user.displayName} used your code from the marketplace.`, "/market");
    log(state, user.email, "referral.apply", String(code));
    return presentMarket(state, user);
  });

export const rateListing = (userId: string, id: unknown, stars: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (typeof id !== "string") throw new ZendoError("Missing listing.");
    const listing = state.listings.find((item) => item.id === id);
    if (!listing) throw new ZendoError("Listing not found.", 404);
    const score = typeof stars === "number" ? stars : Number(stars);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new ZendoError("Rate from 1 to 5.");
    listing.ratings[user.address] = score;
    produceBlock(state, Date.now());
    return presentMarket(state, user);
  });

export const claimVesting = (userId: string) =>
  mutate((state) => {
    userByIdSync(state, userId);
    if (state.publicLaunchAt == null) throw new ZendoError("Public launch has not started. Founder coins stay locked.");
    if (!releaseVested(state)) throw new ZendoError("Nothing is unlocked yet.");
    return presentZcoin(state);
  });

export const readNotices = (userId: string) =>
  mutate((state) => {
    for (const notice of state.notices) if (notice.userId === userId) notice.read = true;
    return presentWallet(state, userByIdSync(state, userId)).notices;
  });

function referralTarget(state: State, code: unknown, email: string): string | null {
  if (typeof code !== "string" || !code.trim()) return null;
  const hit = state.users.find((user) => user.referralCode.toLowerCase() === code.trim().toLowerCase());
  if (!hit || hit.email === email) return null;
  return hit.id;
}

function quizWordHash(seedHash: string, index: number, word: string): string {
  return sha256(`zendo-quiz:${seedHash}:${index}:${word.trim().toLowerCase()}`);
}

function requirePublicKey(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new ZendoError("A 32-byte wallet public key is required.", 400, "malformed");
  }
  return value.toLowerCase();
}

function requireSignature(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{128}$/.test(value)) {
    throw new ZendoError("A 64-byte wallet signature is required.", 400, "signature");
  }
  return value.toLowerCase();
}

/**
 * The exact byte string a client signs to prove it holds the key behind a public key. The domain
 * separator stops a signup proof from being replayed as a recovery proof (and the reverse).
 */
function proofDigest(domain: "zendo-signup" | "zendo-recover", challenge: string): Buffer {
  return Buffer.from(`${domain}:${challenge}`, "utf8");
}

function assertProof(publicKey: string, domain: "zendo-signup" | "zendo-recover", challenge: string, signature: string): void {
  const ok = verifyEd25519(Buffer.from(publicKey, "hex"), proofDigest(domain, challenge), Buffer.from(signature, "hex"));
  if (!ok) throw new ZendoError("The wallet key proof did not verify.", 401, "signature");
}

function uniqueCode(state: State): string {
  for (let i = 0; i < 8; i += 1) {
    const code = nid("r").slice(-6).toUpperCase();
    if (!state.users.some((user) => user.referralCode === code) && !state.pending.some((row) => row.referralCode === code)) return code;
  }
  return nid("r").slice(-8).toUpperCase();
}

export const beginSignup = (input: Record<string, unknown>) => {
  if (!custodialSigningAllowed()) return Promise.reject(new ZendoError("Create the recovery phrase on your device. This server never generates or receives one.", 400));
  return mutate((state) => {
    const email = emailOf(input.email);
    const displayName = nameOf(input.displayName);
    const password = passwordOf(input.password);
    if (state.users.some((user) => user.email === email)) throw new ZendoError("An account with this email already exists.");
    state.pending = state.pending.filter((row) => row.email !== email);
    const phrase = generatePhrase();
    const text = phraseText(phrase);
    const seedHash = phraseHash(text);
    const quiz = pickIndexes(12, 3);
    const pending = {
      id: nid("pend"),
      email,
      displayName,
      passwordHash: bcrypt.hashSync(password, 10),
      phraseHash: seedHash,
      quizHashes: quiz.map((index) => quizWordHash(seedHash, index, phrase[index])),
      address: addressFromPhrase(text),
      quiz,
      referralCode: uniqueCode(state),
      referredBy: referralTarget(state, input.referral, email),
      stage: "seed" as const,
      attempts: 0,
      expires: Date.now() + 30 * 60 * 1000,
    };
    state.pending.push(pending);
    return { pendingId: pending.id, words: phrase, quiz: pending.quiz };
  });
};

export const answerSeed = (pendingId: unknown, picks: unknown) => {
  if (!custodialSigningAllowed()) return Promise.reject(new ZendoError("Create the recovery phrase on your device. This server never generates or receives one.", 400));
  return mutate((state) => {
    if (typeof pendingId !== "string") throw new ZendoError("Signup session missing. Start again.");
    const pending = state.pending.find((row) => row.id === pendingId);
    if (!pending || pending.expires < Date.now() || pending.stage !== "seed" || pending.quizHashes.length !== 3) {
      throw new ZendoError("That signup session expired. Start again.");
    }
    if (!Array.isArray(picks) || picks.length !== 3) throw new ZendoError("Enter the three requested words.");
    const ok = pending.quiz.every(
      (index, position) => quizWordHash(pending.phraseHash, index, String(picks[position] || "")) === pending.quizHashes[position],
    );
    if (!ok) {
      pending.attempts += 1;
      if (pending.attempts >= 8) state.pending = state.pending.filter((row) => row.id !== pending.id);
      throw new ZendoError("Those words don't match the phrase. Check the order and try again.");
    }
    pending.stage = "pin";
    pending.quizHashes = [];
    return { ok: true };
  });
};

export const choosePin = (pendingId: unknown, pin: unknown) =>
  mutate((state) => {
    if (typeof pendingId !== "string") throw new ZendoError("Signup session missing. Start again.");
    const pending = state.pending.find((row) => row.id === pendingId);
    if (!pending || pending.expires < Date.now() || pending.stage !== "pin") {
      throw new ZendoError("Finish the recovery phrase step before setting a PIN.");
    }
    const user: User = {
      id: nid("usr"),
      email: pending.email,
      displayName: pending.displayName,
      passwordHash: pending.passwordHash,
      pinHash: bcrypt.hashSync(pinOf(pin), 10),
      seedHash: pending.phraseHash,
      address: pending.address,
      role: "user",
      banned: false,
      referralCode: pending.referralCode,
      referredBy: pending.referredBy,
      premium: false,
      sessionVersion: 1,
      pinAttempts: 0,
      pinLockedUntil: 0,
      createdAt: Date.now(),
      ...(pending.publicKey ? { publicKey: pending.publicKey, l1Address: pending.l1Address } : {}),
    };
    const drop = z(getConfig().airdrop);
    state.accounts[user.address] = {
      address: user.address,
      userId: user.id,
      label: user.displayName,
      balances: { ZCOIN: "0" },
      nonce: 0,
    };
    if (drop > 0n) {
      debit(state, SYSTEM.faucet, "ZCOIN", drop, "faucet");
      state.accounts[user.address].balances.ZCOIN = drop.toString();
      pushTx(state, {
        at: Date.now(),
        type: "airdrop",
        from: SYSTEM.faucet,
        to: user.address,
        token: "ZCOIN",
        symbol: "ZCOIN",
        amount: drop.toString(),
        amountDisplay: formatZ(drop, 2),
        fee: "0",
        feeDisplay: "0",
        summary: `Faucet allocation of ${formatZ(drop, 0)} ZCoin`,
        gasUsed: 21_000,
      });
    }
    state.users.push(user);
    state.pending = state.pending.filter((row) => row.id !== pending.id);
    produceBlock(state, Date.now());
    notify(state, user.id, "Wallet ready", drop > 0n ? `${formatZ(drop, 0)} ZCoin is in your wallet. Save the recovery phrase. We do not store it.` : "Your wallet is open with 0 ZCoin. The faucet is closed. Save the recovery phrase. We do not store it.", "/app");
    if (user.referredBy) notify(state, user.referredBy, "Referral joined", `${user.displayName} created a wallet with your code.`, "/app");
    return toPublic(user);
  });

export const userByEmail = (email: string) => view((state) => state.users.find((user) => user.email === emailOf(email)) || null);
export const userById = (id: string) => view((state) => state.users.find((user) => user.id === id) || null);

export const recordPinFailure = (userId: string) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    user.pinAttempts += 1;
    if (user.pinAttempts >= 5) {
      user.pinLockedUntil = Date.now() + 5 * 60 * 1000;
      user.pinAttempts = 0;
    }
    return { lockedUntil: user.pinLockedUntil };
  });

export const clearPinFailure = (userId: string) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    user.pinAttempts = 0;
    user.pinLockedUntil = 0;
    return toPublic(user);
  });

export const forgot = (email: unknown, origin: string) =>
  mutate((state) => {
    const user = state.users.find((item) => item.email === emailOf(email));
    if (!user || user.banned) return { ok: true as const, link: null as string | null };
    const raw = nid("reset") + nid("k");
    state.resets.unshift({ id: nid("rst"), userId: user.id, tokenHash: sha256(raw), expires: Date.now() + 30 * 60 * 1000, used: false });
    const link = `${origin}/reset-password?token=${encodeURIComponent(raw)}`;
    state.mailbox.unshift({
      id: nid("mail"),
      at: Date.now(),
      to: user.email,
      subject: "Reset your Zendo password",
      body: "Use this reset link within 30 minutes. Your PIN and recovery phrase stay the same.",
      link,
    });
    if (state.mailbox.length > 50) state.mailbox.length = 50;
    return { ok: true as const, link };
  });

export const resetPassword = (token: unknown, password: unknown) =>
  mutate((state) => {
    if (typeof token !== "string" || token.length < 10) throw new ZendoError("This reset link is invalid.");
    const hash = sha256(token);
    const row = state.resets.find((item) => item.tokenHash === hash);
    if (!row || row.used || row.expires < Date.now()) throw new ZendoError("This reset link is invalid or expired.");
    const user = userByIdSync(state, row.userId);
    user.passwordHash = bcrypt.hashSync(passwordOf(password), 10);
    user.sessionVersion += 1;
    user.pinAttempts = 0;
    row.used = true;
    log(state, user.email, "password.reset", "Password changed from a reset link.");
    return { ok: true };
  });

export const recover = (input: Record<string, unknown>) => {
  if (!custodialSigningAllowed()) return Promise.reject(new ZendoError("Recover with an on-device key proof. This server never receives a recovery phrase.", 400));
  return mutate((state) => {
    const email = emailOf(input.email);
    const user = state.users.find((item) => item.email === email);
    const phrase = normalizePhrase(typeof input.phrase === "string" ? input.phrase : Array.isArray(input.phrase) ? input.phrase.map(String) : "");
    if (!user || user.seedHash !== phraseHash(phraseText(phrase))) {
      throw new ZendoError("That email and recovery phrase do not match.");
    }
    if (user.banned) throw new ZendoError("This account is paused.", 403);
    user.passwordHash = bcrypt.hashSync(passwordOf(input.password), 10);
    user.pinHash = bcrypt.hashSync(pinOf(input.pin), 10);
    user.sessionVersion += 1;
    user.pinAttempts = 0;
    user.pinLockedUntil = 0;
    log(state, user.email, "account.recover", "Password and PIN replaced with the recovery phrase.");
    return { user: toPublic(user), sessionVersion: user.sessionVersion };
  });
};

export const beginSignupClient = (input: Record<string, unknown>) =>
  mutate((state) => {
    const email = emailOf(input.email);
    const displayName = nameOf(input.displayName);
    const password = passwordOf(input.password);
    if (state.users.some((user) => user.email === email)) throw new ZendoError("An account with this email already exists.");
    state.pending = state.pending.filter((row) => row.email !== email);
    const pending: PendingUser = {
      id: nid("pend"),
      email,
      displayName,
      passwordHash: bcrypt.hashSync(password, 10),
      phraseHash: "",
      quizHashes: [],
      address: "",
      quiz: [],
      referralCode: uniqueCode(state),
      referredBy: referralTarget(state, input.referral, email),
      stage: "seed",
      attempts: 0,
      expires: Date.now() + 30 * 60 * 1000,
      mode: "client",
      challenge: randomHex(16),
    };
    state.pending.push(pending);
    return { pendingId: pending.id, challenge: pending.challenge };
  });

export const commitSignup = (pendingId: unknown, input: Record<string, unknown>) =>
  mutate((state) => {
    if (typeof pendingId !== "string") throw new ZendoError("Signup session missing. Start again.");
    const pending = state.pending.find((row) => row.id === pendingId && row.mode === "client");
    if (!pending || pending.expires < Date.now() || pending.stage !== "seed" || !pending.challenge) {
      throw new ZendoError("That signup session expired. Start again.");
    }
    const publicKey = requirePublicKey(input.publicKey);
    const signature = requireSignature(input.signature);
    assertProof(publicKey, "zendo-signup", pending.challenge, signature);
    const l1Address = addressFromPublic(Buffer.from(publicKey, "hex"));
    if (state.users.some((user) => user.l1Address === l1Address)) {
      throw new ZendoError("This wallet key is already registered.");
    }
    pending.publicKey = publicKey;
    pending.l1Address = l1Address;
    pending.address = addressFromLabel(`wallet:${pending.id}`);
    pending.stage = "pin";
    return { ok: true, address: pending.address, l1Address };
  });

export const beginRecover = (email: unknown) =>
  mutate((state) => {
    const address = emailOf(email);
    const user = state.users.find((item) => item.email === address);
    state.pending = state.pending.filter((row) => row.email !== address || row.mode !== "recover");
    const pending: PendingUser = {
      id: nid("rec"),
      email: address,
      displayName: user?.displayName ?? "",
      passwordHash: "",
      phraseHash: "",
      quizHashes: [],
      address: "",
      quiz: [],
      referralCode: "",
      referredBy: null,
      stage: "seed",
      attempts: 0,
      expires: Date.now() + 30 * 60 * 1000,
      mode: "recover",
      challenge: randomHex(16),
      userId: user?.id,
    };
    state.pending.push(pending);
    // Never reveal whether the account exists or holds an on-chain key.
    return { pendingId: pending.id, challenge: user && user.publicKey ? pending.challenge : null };
  });

export const finishRecover = (pendingId: unknown, input: Record<string, unknown>) =>
  mutate((state) => {
    if (typeof pendingId !== "string") throw new ZendoError("Recovery session missing. Start again.");
    const pending = state.pending.find((row) => row.id === pendingId && row.mode === "recover");
    if (!pending || pending.expires < Date.now() || !pending.challenge) {
      throw new ZendoError("That recovery session expired. Start again.");
    }
    const user = pending.userId ? state.users.find((item) => item.id === pending.userId) : undefined;
    if (!user || !user.publicKey) {
      state.pending = state.pending.filter((row) => row.id !== pending.id);
      throw new ZendoError("That account cannot be recovered with a phrase.");
    }
    assertProof(user.publicKey, "zendo-recover", pending.challenge, requireSignature(input.signature));
    if (user.banned) throw new ZendoError("This account is paused.", 403);
    user.passwordHash = bcrypt.hashSync(passwordOf(input.password), 10);
    user.pinHash = bcrypt.hashSync(pinOf(input.pin), 10);
    user.sessionVersion += 1;
    user.pinAttempts = 0;
    user.pinLockedUntil = 0;
    state.pending = state.pending.filter((row) => row.id !== pending.id);
    log(state, user.email, "account.recover", "Password and PIN replaced after an on-device key proof.");
    return { user: toPublic(user), sessionVersion: user.sessionVersion };
  });

export const changePassword = (userId: string, current: unknown, next: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (!bcrypt.compareSync(typeof current === "string" ? current : "", user.passwordHash)) {
      throw new ZendoError("Current password is wrong.");
    }
    user.passwordHash = bcrypt.hashSync(passwordOf(next), 10);
    user.sessionVersion += 1;
    return { user: toPublic(user), sessionVersion: user.sessionVersion };
  });

export const changePin = (userId: string, current: unknown, next: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (!bcrypt.compareSync(pinOf(current), user.pinHash)) throw new ZendoError("Current PIN is wrong.");
    user.pinHash = bcrypt.hashSync(pinOf(next), 10);
    user.sessionVersion += 1;
    return { user: toPublic(user), sessionVersion: user.sessionVersion };
  });

export const submitContact = (input: Record<string, unknown>) =>
  mutate((state) => {
    const topics = ["General", "Validators", "Premium RPC", "Press", "Security"];
    const topic = typeof input.topic === "string" && topics.includes(input.topic) ? input.topic : "";
    if (!topic) throw new ZendoError("Choose a topic.");
    state.contacts.unshift({
      id: nid("msg"),
      at: Date.now(),
      name: nameOf(input.name),
      email: emailOf(input.email),
      topic,
      message: textOf(input.message, "A message", 10, 1000),
    });
    if (state.contacts.length > 100) state.contacts.length = 100;
    return { ok: true };
  });

const TICKET_CATEGORIES = ["Account", "Wallet", "Launchpad", "Bridge", "Other"];
const TICKET_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"]);

function ticketView(ticket: State["tickets"][number], desk = false): TicketView {
  const status = (ticket.status as string) === "answered" ? "resolved" : ticket.status;
  return {
    id: ticket.id,
    userId: ticket.userId,
    displayName: ticket.displayName,
    subject: ticket.subject,
    category: ticket.category,
    body: ticket.body,
    attachmentName: ticket.attachmentName,
    attachmentType: ticket.attachmentType,
    attachmentData: ticket.attachmentData,
    status,
    createdAt: ticket.createdAt,
    replies: ticket.replies || [],
    notes: desk ? ticket.notes || [] : [],
  };
}

function attachmentOf(input: Record<string, unknown>) {
  const name = input.attachmentName;
  const type = input.attachmentType;
  const data = input.attachmentData;
  const empty = (value: unknown) => value == null || value === "";
  if (empty(name) && empty(type) && empty(data)) {
    return { attachmentName: null, attachmentType: null, attachmentData: null };
  }
  if (typeof name !== "string" || typeof type !== "string" || typeof data !== "string") {
    throw new ZendoError("The attachment is incomplete.");
  }
  const clean = name.replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!/^[A-Za-z0-9._ -]{1,80}$/.test(clean)) throw new ZendoError("Use a simple file name.");
  if (!TICKET_TYPES.has(type)) throw new ZendoError("Attach a PNG, JPEG, WebP, PDF, or text file.");
  const payload = (data.includes(",") ? data.split(",").pop() : data) || "";
  const packed = payload.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(packed) || packed.length > 160_000) {
    throw new ZendoError("Attachments stay under 120 KB.");
  }
  return { attachmentName: clean, attachmentType: type, attachmentData: `data:${type};base64,${packed}` };
}

export const submitTicket = (userId: string, input: Record<string, unknown>) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const category = typeof input.category === "string" && TICKET_CATEGORIES.includes(input.category) ? input.category : "";
    if (!category) throw new ZendoError("Choose a category.");
    if (!Array.isArray(state.tickets)) state.tickets = [];
    const ticket = {
      id: nid("tkt"),
      userId: user.id,
      displayName: user.displayName,
      subject: textOf(input.subject, "A subject", 4, 80),
      category,
      body: textOf(input.body, "A description", 10, 2000),
      ...attachmentOf(input),
      status: "open" as const,
      createdAt: Date.now(),
      replies: [],
      notes: [],
    };
    state.tickets.unshift(ticket);
    if (state.tickets.length > 200) state.tickets.length = 200;
    log(state, user.email, "ticket.open", ticket.subject);
    return { tickets: state.tickets.filter((row) => row.userId === user.id).map((row) => ticketView(row)) };
  });

export const replyTicket = (userId: string, ticketId: unknown, body: unknown, as?: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (typeof ticketId !== "string") throw new ZendoError("Missing ticket.");
    const ticket = (state.tickets || []).find((row) => row.id === ticketId);
    if (!ticket) throw new ZendoError("Ticket not found.", 404);
    const desk = as === "operator";
    if (desk && user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    if (!desk && ticket.userId !== user.id) throw new ZendoError("That ticket belongs to another account.", 403);
    if (!desk && ticket.status === "closed") throw new ZendoError("This ticket is closed.");
    if (!Array.isArray(ticket.replies)) ticket.replies = [];
    ticket.replies.push({
      id: nid("rpl"),
      at: Date.now(),
      from: desk ? "operator" : "user",
      body: textOf(body, "A reply", 2, 2000),
    });
    if (ticket.replies.length > 40) ticket.replies.splice(0, ticket.replies.length - 40);
    if (!desk) ticket.status = "open";
    else if (ticket.status === "open") ticket.status = "progress";
    log(state, user.email, desk ? "ticket.answer" : "ticket.reply", ticket.id);
    const rows = desk ? state.tickets : state.tickets.filter((row) => row.userId === user.id);
    return { tickets: rows.map((row) => ticketView(row, desk)) };
  });

export const listTickets = (userId: string) =>
  view((state) => {
    const user = userByIdSync(state, userId);
    const rows = (state.tickets || []).filter((row) => row.userId === user.id);
    return { tickets: rows.map((row) => ticketView(row, false)) };
  });

const TICKET_STATUSES = ["open", "progress", "resolved", "closed"] as const;
const ACCOUNT_ROLES = ["user", "creator", "moderator", "admin"] as const;

export const setTicketStatus = (userId: string, ticketId: unknown, status: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    if (typeof ticketId !== "string") throw new ZendoError("Missing ticket.");
    if (typeof status !== "string" || !TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number])) {
      throw new ZendoError("Choose a ticket status.");
    }
    const ticket = (state.tickets || []).find((row) => row.id === ticketId);
    if (!ticket) throw new ZendoError("Ticket not found.", 404);
    ticket.status = status as (typeof TICKET_STATUSES)[number];
    log(state, user.email, "ticket.status", `${ticket.id} → ${ticket.status}`);
    return presentAdmin(state);
  });

export const addTicketNote = (userId: string, ticketId: unknown, body: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    if (typeof ticketId !== "string") throw new ZendoError("Missing ticket.");
    const ticket = (state.tickets || []).find((row) => row.id === ticketId);
    if (!ticket) throw new ZendoError("Ticket not found.", 404);
    if (!Array.isArray(ticket.notes)) ticket.notes = [];
    ticket.notes.push({ id: nid("note"), at: Date.now(), actor: user.email, body: textOf(body, "A note", 2, 500) });
    if (ticket.notes.length > 30) ticket.notes.splice(0, ticket.notes.length - 30);
    log(state, user.email, "ticket.note", ticket.id);
    return presentAdmin(state);
  });

export const adminUserRole = (userId: string, targetId: unknown, role: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    if (typeof targetId !== "string") throw new ZendoError("Missing account.");
    if (typeof role !== "string" || !ACCOUNT_ROLES.includes(role as (typeof ACCOUNT_ROLES)[number])) {
      throw new ZendoError("Choose a role.");
    }
    const target = state.users.find((item) => item.id === targetId);
    if (!target) throw new ZendoError("Account not found.", 404);
    if (target.id === user.id && role !== "admin") throw new ZendoError("Keep your own operator role.");
    if (target.role === "admin" && role !== "admin" && state.users.filter((item) => item.role === "admin").length < 2) {
      throw new ZendoError("Keep at least one operator.");
    }
    target.role = role as (typeof ACCOUNT_ROLES)[number];
    log(state, user.email, "user.role", `${target.email} → ${target.role}`);
    return presentAdmin(state);
  });

export const adminUserBan = (userId: string, targetId: unknown, banned: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    if (typeof targetId !== "string") throw new ZendoError("Missing account.");
    const target = state.users.find((item) => item.id === targetId);
    if (!target) throw new ZendoError("Account not found.", 404);
    if (target.id === user.id) throw new ZendoError("You cannot pause your own account.");
    const next = Boolean(banned);
    if (next && target.role === "admin" && state.users.filter((item) => item.role === "admin" && !item.banned && item.id !== target.id).length === 0) {
      throw new ZendoError("Keep at least one operator.");
    }
    target.banned = next;
    if (next) target.sessionVersion += 1;
    log(state, user.email, next ? "user.pause" : "user.restore", target.email);
    return presentAdmin(state);
  });

export const historyFor = (userId: string) =>
  view((state) => {
    const user = userByIdSync(state, userId);
    const address = user.address;
    const file: HistoryFile = {
      address,
      displayName: user.displayName,
      exportedAt: Date.now(),
      transactions: state.txs
        .filter((tx) => tx.from === address || tx.to === address)
        .slice(0, 500)
        .map((tx) => ({
          hash: tx.hash,
          at: tx.at,
          type: tx.type,
          from: tx.from,
          to: tx.to,
          symbol: tx.symbol,
          amount: tx.amountDisplay,
          fee: tx.feeDisplay,
          summary: tx.summary,
        })),
      staking: {
        stakes: state.stakes
          .filter((stake) => stake.address === address)
          .map((stake) => ({
            id: stake.id,
            validatorId: stake.validatorId,
            amount: formatZ(BigInt(stake.amount), 6),
            accrued: formatZ(BigInt(stake.accrued), 6),
          })),
        unbonding: state.unbonding
          .filter((row) => row.address === address)
          .map((row) => ({
            id: row.id,
            amount: formatZ(BigInt(row.amount), 6),
            readyHeight: row.readyHeight,
          })),
      },
      governance: [
        ...state.proposals
          .filter((proposal) => proposal.author === address || proposal.votes[address])
          .map((proposal) => ({
            id: proposal.id,
            kind: "proposal" as const,
            title: proposal.title,
            status: proposal.status,
            filed: proposal.author === address,
            choice: proposal.votes[address]?.choice || null,
            weight: proposal.votes[address]?.weight || null,
            at: proposal.createdAt,
          })),
        ...state.grants
          .filter((grant) => grant.author === address || grant.votes[address])
          .map((grant) => ({
            id: grant.id,
            kind: "grant" as const,
            title: grant.title,
            status: grant.status,
            filed: grant.author === address,
            choice: grant.votes[address]?.choice || null,
            weight: grant.votes[address]?.weight || null,
            at: grant.createdAt,
          })),
      ],
      memeCoins: {
        created: state.coins
          .filter((coin) => coin.creator === address)
          .map((coin) => ({ mint: coin.mint, name: coin.name, symbol: coin.symbol, createdAt: coin.createdAt })),
        trades: state.coins.flatMap((coin) =>
          coin.trades
            .filter((trade) => trade.address === address)
            .map((trade) => ({
              id: trade.id,
              at: trade.at,
              mint: coin.mint,
              symbol: coin.symbol,
              side: trade.side,
              zBase: trade.zBase,
              tokenBase: trade.tokenBase,
            })),
        ),
        votes: state.coins.flatMap((coin) =>
          coin.votes[address] ? [{ mint: coin.mint, symbol: coin.symbol, direction: coin.votes[address] }] : [],
        ),
      },
    };
    return file;
  });

const historyPasses = new Map<string, { userId: string; format: "json" | "csv"; expires: number }>();

export const issueHistoryPass = (userId: string, format: unknown) =>
  view((state) => {
    const user = userByIdSync(state, userId);
    const now = Date.now();
    for (const [key, row] of historyPasses) {
      if (row.expires < now) historyPasses.delete(key);
    }
    const kind = format === "csv" ? "csv" : "json";
    const token = sha256(`zendo-history:${user.id}:${Date.now()}:${nid("hst")}`).slice(0, 32);
    historyPasses.set(token, { userId: user.id, format: kind, expires: Date.now() + 5 * 60_000 });
    const name = kind === "csv" ? "zendo-history.csv" : "zendo-history.json";
    return { url: `/zendo-history/${token}/${name}` };
  });

export function takeHistoryPass(token: string) {
  const row = historyPasses.get(token);
  if (!row || row.expires < Date.now()) {
    historyPasses.delete(token);
    return null;
  }
  return row;
}

export const admin = (userId: string) =>
  view((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    return presentAdmin(state);
  });

function slashValidator(state: State, validator: Validator, reason: string) {
  const bps = 1000n;
  let total = 0n;
  const self = BigInt(validator.selfStake);
  const selfCut = (self * bps) / 10_000n;
  if (selfCut > 0n) {
    validator.selfStake = (self - selfCut).toString();
    total += selfCut;
  }
  for (const stake of state.stakes) {
    if (stake.validatorId !== validator.id) continue;
    const amount = BigInt(stake.amount);
    const cut = (amount * bps) / 10_000n;
    if (cut <= 0n) continue;
    stake.amount = (amount - cut).toString();
    total += cut;
  }
  if (total > 0n) credit(state, SYSTEM.treasury, "ZCOIN", total);
  const now = Date.now();
  state.slashes.unshift({
    id: nid("slh"),
    at: now,
    validatorId: validator.id,
    moniker: validator.moniker,
    amount: total.toString(),
    reason,
  });
  pushTx(state, {
    at: now,
    type: "slash",
    from: validator.address,
    to: SYSTEM.treasury,
    token: "ZCOIN",
    symbol: "ZCOIN",
    amount: total.toString(),
    amountDisplay: formatZ(total, 4),
    fee: "0",
    feeDisplay: "0",
    summary: `Slashed 10% of ${validator.moniker} into the treasury`,
    gasUsed: 40_000,
  });
  produceBlock(state, now);
}

export const adminValidator = (userId: string, id: unknown, status: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    if (typeof id !== "string") throw new ZendoError("Missing validator.");
    if (status !== "active" && status !== "pending" && status !== "jailed") throw new ZendoError("Unknown status.");
    const validator = state.validators.find((item) => item.id === id);
    if (!validator) throw new ZendoError("Validator not found.", 404);
    if (status === "jailed" && validator.status !== "jailed") slashValidator(state, validator, "jailed");
    validator.status = status;
    log(state, user.email, "validator.status", `${validator.moniker} → ${status}`);
    return presentAdmin(state);
  });

export const adminHide = (userId: string, mint: unknown, hidden: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    if (typeof mint !== "string") throw new ZendoError("Missing coin.");
    const found = state.coins.find((coin) => coin.mint === mint);
    if (!found) throw new ZendoError("Coin not found.", 404);
    found.hidden = Boolean(hidden);
    state.reports.forEach((report) => {
      if (report.mint === found.mint) report.open = false;
    });
    log(state, user.email, "coin.moderate", `${found.symbol} hidden=${found.hidden}`);
    return presentAdmin(state);
  });

export const adminMev = (userId: string, enabled: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    state.mevEnabled = Boolean(enabled);
    log(state, user.email, "mev.toggle", state.mevEnabled ? "on" : "off");
    return presentAdmin(state);
  });

export const adminPremium = (userId: string, email: unknown, premium: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    const target = state.users.find((item) => item.email === emailOf(email));
    if (!target) throw new ZendoError("No account uses that email.", 404);
    target.premium = Boolean(premium);
    log(state, user.email, "premium", `${target.email} ${target.premium ? "granted" : "removed"}`);
    notify(state, target.id, target.premium ? "Premium RPC is on" : "Premium RPC is off", "Chain reads and writes have no per-minute cap.", "/developers");
    return presentAdmin(state);
  });

export const adminFork = (userId: string, remote: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    const local = Math.max(0, state.height);
    const remoteHeight = typeof remote === "number" ? remote : local > 0 ? local - 1 : 0;
    const decision = chooseCanonical(local, remoteHeight);
    if (!decision.valid) {
      state.counters.malformed += 1;
      throw new ZendoError(decision.reason, 400, "malformed");
    }
    if (decision.keep === "local") state.forksResolved += 1;
    log(state, user.email, "fork.choice", `local ${local} vs remote ${remoteHeight}: ${decision.reason}`);
    return { ...decision, local, remote: remoteHeight, forksResolved: state.forksResolved };
  });

const rpcHits = new Map<string, { n: number; reset: number }>();

export function rateHit(key: string, limit: number, message = "Too many attempts. Wait a minute.") {
  const now = Date.now();
  const row = rpcHits.get(key);
  if (!row || now > row.reset) {
    rpcHits.set(key, { n: 1, reset: now + 60_000 });
    return;
  }
  row.n += 1;
  if (row.n > limit) throw new ZendoError(message, 429);
}

export async function rateHitShared(key: string, limit: number, message = "Too many attempts. Wait a minute.") {
  const shared = await cacheIncr(`rate:${key}`, 60);
  if (shared == null) {
    rateHit(key, limit, message);
    return;
  }
  if (shared > limit) throw new ZendoError(message, 429);
}

export function callerKey(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const raw = forwarded || req.headers.get("x-real-ip") || "local";
  return raw.slice(0, 80);
}

/** Kept so older callers compile. Chain traffic is not rejected for rate. */
export function rateRpc(_key: string, _limit: number) {
  return;
}

export const rpc = async (method: string, params: unknown[], userId: string | null) => {
  if (userId) await userById(userId);
  const read = <T>(fn: (state: State) => T) => view(fn);
  switch (method) {
    case "zendo_chainId":
      return read((state) => state.networkId);
    case "zendo_blockNumber": {
      const { cacheGet, cacheSet } = await import("./cache");
      const hit = await cacheGet("rpc:height");
      if (hit) return Number(hit);
      const height = await read((state) => state.height);
      void cacheSet("rpc:height", String(height), 1);
      return height;
    }
    case "zendo_getBalance": {
      const address = addressOf(params[0]);
      const token = typeof params[1] === "string" ? params[1] : "ZCOIN";
      return read((state) => {
        const account = state.accounts[address];
        if (!account) throw new ZendoError("Address not found.", 404);
        const id = token.toUpperCase() === "ZCOIN" ? "ZCOIN" : state.coins.find((coin) => coin.symbol === token.toUpperCase() || coin.mint === token)?.mint;
        if (!id) throw new ZendoError("Unknown token.");
        const raw = BigInt(account.balances[id] || "0");
        return { address, token: token.toUpperCase() === "ZCOIN" ? "ZCOIN" : token, amount: id === "ZCOIN" ? formatZ(raw, 6) : formatToken(raw, 4) };
      });
    }
    case "zendo_getBlockByHeight":
      return block(Number(params[0]));
    case "zendo_getTransactionByHash":
      return transaction(String(params[0] || ""));
    case "zendo_estimateGas":
      return fees();
    case "zendo_call": {
      const [mint, mode, amount] = params;
      if (typeof mint !== "string") throw new ZendoError("Pass a mint, side, and amount.");
      return quote(mint, mode, amount);
    }
    default:
      throw new ZendoError(`Unknown method ${method}.`, 404);
  }
};

function bridgeDeskOf(state: State, address: string) {
  const settings = bridgeSettings();
  const vault = BigInt(state.accounts[SYSTEM.bridge]?.balances.ZCOIN || "0");
  return {
    configured: settings.ready,
    polygonBridge: settings.bridge || null,
    signer: settings.signer || null,
    chainId: settings.chainId || 137,
    vault: SYSTEM.bridge,
    vaultZ: formatZ(vault, 4),
    fee: formatZ(gas("transfer"), 4),
    withdrawals: state.bridgeWithdrawals.filter((row) => row.from === address).slice(-12).reverse().map((row) => ({
      ...row,
      amountDisplay: formatZ(BigInt(row.amount), 4),
    })),
    deposits: state.bridgeDeposits.filter((row) => row.address === address).slice(-12).reverse().map((row) => ({
      ...row,
      amountDisplay: formatZ(BigInt(row.amount), 4),
    })),
  };
}

export const bridgeDesk = (userId: string) =>
  view((state) => {
    const user = userByIdSync(state, userId);
    return { ...bridgeDeskOf(state, user.address), admin: user.role === "admin" };
  });

function lockReplayKey(txHash: string, logIndex: number) {
  return `lock:${txHash}:${logIndex}`;
}

function replaySeen(state: State, key: string) {
  return state.bridgeReplay.includes(key) || state.bridgeDeposits.some((row) => row.key === key.slice(5));
}

function rememberReplay(state: State, key: string) {
  if (!state.bridgeReplay.includes(key)) state.bridgeReplay.push(key);
}

function creditLock(state: State, user: User, lock: { txHash: string; logIndex: number; amount: bigint }) {
  const key = lockReplayKey(lock.txHash, lock.logIndex);
  if (replaySeen(state, key)) throw new ZendoError("That Polygon lock was already credited.");
  const vault = BigInt(state.accounts[SYSTEM.bridge]?.balances.ZCOIN || "0");
  if (vault < lock.amount) {
    throw new ZendoError("The Zendo bridge vault does not have enough ZendoCoin to pay this deposit. Coins arrive there when someone withdraws, or when an operator seeds the vault from their own wallet.");
  }
  debit(state, SYSTEM.bridge, "ZCOIN", lock.amount, "bridge vault");
  credit(state, user.address, "ZCOIN", lock.amount);
  const tx = pushTx(state, {
    at: Date.now(),
    type: "bridge.deposit",
    from: SYSTEM.bridge,
    to: user.address,
    token: "ZCOIN",
    symbol: "ZCOIN",
    amount: lock.amount.toString(),
    amountDisplay: formatZ(lock.amount, 4),
    fee: "0",
    feeDisplay: "0",
    summary: `Bridge deposit ${formatZ(lock.amount, 4)} Z from Polygon ${lock.txHash}`,
    gasUsed: 40_000,
  });
  rememberReplay(state, key);
  state.bridgeDeposits.push({
    id: nid("dep"),
    key: `${lock.txHash}:${lock.logIndex}`,
    polygonTx: lock.txHash,
    logIndex: lock.logIndex,
    address: user.address,
    amount: lock.amount.toString(),
    at: Date.now(),
    txHash: tx.hash,
  });
  return { amount: formatZ(lock.amount, 4), txHash: tx.hash, polygonTx: lock.txHash, logIndex: lock.logIndex };
}

function applyBridgeLocks(state: State, user: User, receipt: unknown, txHashValue: string) {
  const settings = bridgeSettings();
  if (!settings.bridge) {
    throw new ZendoError("Set ZENDO_POLYGON_BRIDGE before a deposit can be matched to a contract.");
  }
  const locks = parseLockLogs(receipt, settings.bridge, txHashValue).filter((lock) => lock.zendoHash === zendoAccountHash(user.address));
  if (!locks.length) throw new ZendoError("No Polygon lock in that receipt names this znd1 address.");
  const fresh = locks.filter((lock) => !replaySeen(state, lockReplayKey(lock.txHash, lock.logIndex)));
  if (!fresh.length) throw new ZendoError("That Polygon lock was already credited.");
  const sum = fresh.reduce((total, lock) => total + lock.amount, 0n);
  const vault = BigInt(state.accounts[SYSTEM.bridge]?.balances.ZCOIN || "0");
  if (vault < sum) {
    throw new ZendoError("The Zendo bridge vault does not have enough ZendoCoin to pay this deposit. Coins arrive there when someone withdraws, or when an operator seeds the vault from their own wallet.");
  }
  const credited = [];
  for (const lock of fresh) {
    debit(state, SYSTEM.bridge, "ZCOIN", lock.amount, "bridge vault");
    credit(state, user.address, "ZCOIN", lock.amount);
    const tx = pushTx(state, {
      at: Date.now(),
      type: "bridge.deposit",
      from: SYSTEM.bridge,
      to: user.address,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: lock.amount.toString(),
      amountDisplay: formatZ(lock.amount, 4),
      fee: "0",
      feeDisplay: "0",
      summary: `Bridge deposit ${formatZ(lock.amount, 4)} Z from Polygon ${lock.txHash}`,
      gasUsed: 40_000,
    });
    rememberReplay(state, lockReplayKey(lock.txHash, lock.logIndex));
    state.bridgeDeposits.push({
      id: nid("dep"),
      key: `${lock.txHash}:${lock.logIndex}`,
      polygonTx: lock.txHash,
      logIndex: lock.logIndex,
      address: user.address,
      amount: lock.amount.toString(),
      at: Date.now(),
      txHash: tx.hash,
    });
    credited.push({ amount: formatZ(lock.amount, 4), txHash: tx.hash, polygonTx: lock.txHash, logIndex: lock.logIndex });
  }
  produceBlock(state, Date.now());
  log(state, user.email, "bridge.deposit", `${fresh.length} lock(s) from ${txHashValue}`);
  notify(state, user.id, "Bridge deposit credited", `${formatZ(sum, 4)} Z moved from the bridge vault to this wallet.`, "/app/bridge");
  return { ...bridgeDeskOf(state, user.address), credited };
}

export const bridgeWithdraw = (userId: string, recipient: unknown, amount: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    const settings = bridgeSettings();
    if (!settings.ready || !settings.secret) {
      throw new ZendoError("Set ZENDO_POLYGON_BRIDGE and ZENDO_BRIDGE_PRIVATE_KEY before a withdrawal can be signed. Coins stay in the wallet until a voucher exists.");
    }
    const to = parsePolygonAddress(recipient, "Polygon recipient");
    const value = z(textOf(amount, "An amount", 1, 40));
    if (value <= 0n) throw new ZendoError("Enter an amount greater than zero.");
    const nonce = state.bridgeNonce + 1;
    const releaseKey = `release:${settings.chainId}:${settings.bridge}:${nonce}`;
    if (replaySeen(state, releaseKey)) throw new ZendoError("That bridge voucher was already signed.");
    const fee = gas("transfer");
    debit(state, user.address, "ZCOIN", value + fee, "ZCoin");
    credit(state, SYSTEM.bridge, "ZCOIN", value);
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "gas", fee);
    const voucher = signRelease({
      chainId: settings.chainId,
      bridge: settings.bridge,
      recipient: to,
      amount: value,
      nonce: BigInt(nonce),
      secret: settings.secret,
    });
    if (!verifyRelease(voucher) || voucher.signer !== settings.signer) {
      throw new ZendoError("The bridge voucher did not verify.", 500, "signature");
    }
    state.bridgeNonce = nonce;
    rememberReplay(state, releaseKey);
    const tx = pushTx(state, {
      at: Date.now(),
      type: "bridge.lock",
      from: user.address,
      to: SYSTEM.bridge,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: value.toString(),
      amountDisplay: formatZ(value, 4),
      fee: fee.toString(),
      feeDisplay: formatZ(fee, 4),
      summary: `Locked ${formatZ(value, 4)} Z for Polygon ${to}`,
      gasUsed: 40_000,
    });
    state.bridgeWithdrawals.push({
      id: nid("wd"),
      nonce,
      from: user.address,
      recipient: to,
      amount: value.toString(),
      fee: fee.toString(),
      signature: voucher.signature,
      innerHash: voucher.innerHash,
      signer: voucher.signer,
      bridge: voucher.bridge,
      chainId: voucher.chainId,
      at: Date.now(),
      txHash: tx.hash,
    });
    if (state.bridgeWithdrawals.length > 400) state.bridgeWithdrawals.splice(0, state.bridgeWithdrawals.length - 400);
    produceBlock(state, Date.now());
    log(state, user.email, "bridge.lock", `nonce ${nonce} amount ${value.toString()}`);
    notify(state, user.id, "Bridge withdrawal signed", `Submit the voucher in your Polygon wallet to release ${formatZ(value, 4)} ZCOIN.`, "/app/bridge");
    return { ...bridgeDeskOf(state, user.address), voucher: state.bridgeWithdrawals[state.bridgeWithdrawals.length - 1] };
  });

export const bridgeSeed = (userId: string, amount: unknown) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    const value = z(textOf(amount, "An amount", 1, 40));
    if (value <= 0n) throw new ZendoError("Enter an amount greater than zero.");
    const fee = gas("transfer");
    debit(state, user.address, "ZCOIN", value + fee, "ZCoin");
    credit(state, SYSTEM.bridge, "ZCOIN", value);
    credit(state, SYSTEM.treasury, "ZCOIN", fee);
    addRev(state, "gas", fee);
    pushTx(state, {
      at: Date.now(),
      type: "bridge.seed",
      from: user.address,
      to: SYSTEM.bridge,
      token: "ZCOIN",
      symbol: "ZCOIN",
      amount: value.toString(),
      amountDisplay: formatZ(value, 4),
      fee: fee.toString(),
      feeDisplay: formatZ(fee, 4),
      summary: `Seeded the bridge vault with ${formatZ(value, 4)} Z`,
      gasUsed: 30_000,
    });
    produceBlock(state, Date.now());
    log(state, user.email, "bridge.seed", value.toString());
    return bridgeDeskOf(state, user.address);
  });

export const bridgeDeposit = async (userId: string, txHashRaw: unknown) => {
  const hash = polygonTxHash(txHashRaw);
  const settings = bridgeSettings();
  if (!settings.bridge) throw new ZendoError("Set ZENDO_POLYGON_BRIDGE before a deposit can be matched to a contract.");
  const receipt = await fetchPolygonReceipt(hash);
  return mutate((state) => applyBridgeLocks(state, userByIdSync(state, userId), receipt, hash));
};

export const debugDepositReceipt = (userId: string, receipt: unknown, txHashRaw: unknown) => {
  assertSimulationAllowed("Simulated bridge deposit");
  const hash = polygonTxHash(txHashRaw);
  return mutate((state) => applyBridgeLocks(state, userByIdSync(state, userId), receipt, hash));
};

function creditObserved(state: State, logs: { txHash: string; logIndex: number; zendoHash: string; amount: bigint; blockNumber: bigint }[]) {
  const queued = [
    ...state.bridgeUnmatched.map((row) => ({
      txHash: row.txHash,
      logIndex: row.logIndex,
      zendoHash: row.zendoHash,
      amount: BigInt(row.amount),
      blockNumber: BigInt(row.blockNumber || "0"),
    })),
    ...logs,
  ];
  state.bridgeUnmatched = [];
  let credited = 0;
  let skipped = 0;
  for (const lock of queued) {
    const key = lockReplayKey(lock.txHash, lock.logIndex);
    if (replaySeen(state, key)) continue;
    const user = state.users.find((row) => {
      try {
        return zendoAccountHash(row.address) === lock.zendoHash;
      } catch {
        return false;
      }
    });
    const hold = () => {
      if (!state.bridgeUnmatched.some((row) => row.key === key)) {
        state.bridgeUnmatched.push({
          key,
          txHash: lock.txHash,
          logIndex: lock.logIndex,
          zendoHash: lock.zendoHash,
          amount: lock.amount.toString(),
          blockNumber: lock.blockNumber.toString(),
        });
      }
      skipped += 1;
    };
    if (!user) {
      hold();
      continue;
    }
    const vault = BigInt(state.accounts[SYSTEM.bridge]?.balances.ZCOIN || "0");
    if (vault < lock.amount) {
      hold();
      continue;
    }
    creditLock(state, user, lock);
    credited += 1;
  }
  if (credited > 0) produceBlock(state, Date.now());
  return { credited, skipped };
}

export async function scanBridge() {
  const settings = bridgeSettings();
  if (!settings.bridge || !polygonConfigured()) return { ok: true as const, skipped: true as const };
  const head = await polygonHead();
  const expected = Number(process.env.ZENDO_POLYGON_CHAIN_ID || "137");
  if (head.chainId !== expected) throw new ZendoError(`The Polygon RPC returned chain ${head.chainId}.`);
  const configured = Number(process.env.ZENDO_BRIDGE_CONFIRMATIONS ?? "12");
  const depth = Number.isFinite(configured) && configured >= 0 ? BigInt(Math.floor(configured)) : 12n;
  const safe = head.number > depth ? head.number - depth : 0n;
  const scanBlock = await view((state) => state.bridgeScanBlock || "0");
  let from = 0n;
  try {
    from = BigInt(scanBlock || "0");
  } catch {
    from = 0n;
  }
  if (safe > from && safe - from > 2000n) from = safe - 2000n;
  if (from > safe) return { ok: true as const, skipped: true as const, head: head.number.toString() };
  const logs = await polygonLockLogs(settings.bridge, from, safe);
  return mutate((state) => {
    const result = creditObserved(state, logs);
    state.bridgeScanBlock = safe.toString();
    return {
      ok: true as const,
      skipped: false as const,
      credited: result.credited,
      unmatched: result.skipped,
      head: head.number.toString(),
      scannedTo: safe.toString(),
    };
  });
}

export const ingestShardReceipt = (input: unknown) =>
  mutate((state) => {
    const here = placement();
    if (here.role === "gateway" || here.count <= 1) throw new ZendoError("This process is not accepting shard receipts.");
    const receipt = asReceipt(input);
    if (receipt.toShard !== here.index) throw new ZendoError("That receipt belongs on another shard.");
    if (!receiptMacValid(receipt, here.secret)) throw new ZendoError("That receipt is not from a shard in this fleet.", 400, "signature");
    if (state.shardReplay.includes(receipt.id)) return { ok: true, duplicate: true };
    state.shardReplay.push(receipt.id);
    if (!state.accounts[receipt.to]) {
      state.accounts[receipt.to] = { address: receipt.to, userId: null, label: "External wallet", balances: {}, nonce: 0 };
    }
    credit(state, receipt.to, receipt.asset, BigInt(receipt.amount));
    state.shardImported = (BigInt(state.shardImported || "0") + BigInt(receipt.amount)).toString();
    return { ok: true, duplicate: false };
  });

function asReceipt(input: unknown): ShardReceipt {
  if (!input || typeof input !== "object") throw new ZendoError("Missing receipt.");
  const row = input as Partial<ShardReceipt>;
  if (typeof row.id !== "string" || typeof row.to !== "string" || typeof row.asset !== "string" || typeof row.amount !== "string" || typeof row.mac !== "string") {
    throw new ZendoError("Missing receipt.");
  }
  const fromShard = row.fromShard ?? Number.NaN;
  const toShard = row.toShard ?? Number.NaN;
  if (!Number.isInteger(fromShard) || !Number.isInteger(toShard)) throw new ZendoError("Missing receipt.");
  return {
    id: row.id,
    fromShard,
    toShard,
    to: row.to,
    asset: row.asset,
    amount: row.amount,
    mac: row.mac,
    delivered: Boolean(row.delivered),
  };
}

export const debugRewindBridgeNonce = () => {
  assertSimulationAllowed("Simulated bridge nonce rewind");
  return mutate((state) => {
    state.bridgeNonce = 0;
    return state.bridgeNonce;
  });
};

export async function auditSupply() {
  return view((state) => {
    let accounted = 0n;
    for (const account of Object.values(state.accounts)) accounted += BigInt(account.balances.ZCOIN || "0");
    for (const validator of state.validators) accounted += BigInt(validator.selfStake);
    for (const stake of state.stakes) accounted += BigInt(stake.amount);
    for (const row of state.unbonding) accounted += BigInt(row.amount);
    const base = state.followerShard ? 0n : z(getConfig().supply);
    const supply = base + BigInt(state.shardImported || "0");
    const covered = accounted + BigInt(state.shardExported || "0");
    return { ok: covered === supply, supply: supply.toString(), accounted: covered.toString() };
  });
}

/** Reads the read-model reconciliation checkpoint and the last report. */
export const reconcileStatus = (userId: string) =>
  view((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    return {
      height: state.reconcileHeight ?? 0,
      applied: (state.reconcileApplied ?? []).length,
      fees: state.reconcileFees ?? "0",
      at: state.reconcileAt ?? 0,
      report: state.reconcileReport ?? null,
    };
  });

/**
 * Folds confirmed zendo-1 transfers into the read model. Reads the chain first (never writes it), then
 * applies the deltas inside one ordered commit, guarded by transaction id. Pass `rebuild` to clear the
 * checkpoint and replay every confirmed transfer from genesis.
 */
export async function reconcileFromL1(userId: string, options: { rebuild?: boolean } = {}): Promise<ReconcileReport> {
  await view((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    return true;
  });
  const source = L1Client.fromEnv().reconcileSource();
  const rebuild = options.rebuild === true;
  const from = rebuild ? 1 : await view((state) => (state.reconcileHeight ?? 0) + 1);
  const collected = await collectConfirmed(source, from);
  return mutate((state) => {
    if (rebuild) resetForRebuild(state);
    const report = applyReconcile(state, collected, from, { feeSink: SYSTEM.treasury, now: Date.now() });
    state.reconcileAt = Date.now();
    state.reconcileReport = report;
    log(state, "l1", "reconcile", `${report.applied} applied, ${report.duplicate} duplicate, ${report.unmapped} unmapped, ${report.errors.length} errors`);
    return report;
  });
}

export async function notePublicRequest(headerStore: { get(name: string): string | null }) {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.ZENDO_DISABLE_TIMER === "1") return;
  const rawHost = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const host = rawHost.split(",")[0]?.trim().split(":")[0]?.toLowerCase() || "";
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") return;
  const already = await view((state) => state.publicLaunchAt);
  if (already) return;
  await mutate((state) => {
    if (state.publicLaunchAt) return state.publicLaunchAt;
    const at = Date.now();
    state.publicLaunchAt = at;
    log(state, "genesis", "public.launch", new Date(at).toISOString());
    releaseVested(state, at);
    return at;
  });
}

export async function debugStampLaunch(at: number) {
  assertSimulationAllowed("Stamping the public launch");
  return mutate((state) => {
    state.publicLaunchAt = at;
    releaseVested(state, Date.now());
    return at;
  });
}

export async function debugSettle() {
  assertSimulationAllowed("Simulated proposal settlement");
  return mutate((state) => {
    const now = Date.now();
    for (const proposal of state.proposals) {
      if (proposal.status === "active") proposal.endsAt = now - 1;
    }
    refreshProposals(state);
    return presentProposals(state, null);
  });
}

export async function debugMine(count: number) {
  assertSimulationAllowed("Fake mining");
  return mutate((state) => {
    const n = Math.max(1, Math.min(20, count));
    for (let i = 0; i < n; i += 1) produceBlock(state, Date.now() + i);
    state.lastBlockAt = Date.now();
    return state.height;
  });
}

export async function debugPayReward(userId: string, amount: string) {
  assertSimulationAllowed("Simulated reward payout");
  return mutate((state) => {
    const user = userByIdSync(state, userId);
    const validator = state.validators.find((item) => item.status === "active") || state.validators[0];
    const net = payReward(state, user.address, validator, z(amount));
    return { net: net.toString() };
  });
}

export const externalCatalog = () =>
  view((state) => {
    const assets = registryOf(state);
    return {
      count: assets.length,
      chains: [...new Set(assets.map((asset) => asset.chain))],
      sample: assets[0] || null,
      added: state.externalAssets.length,
      metrics: state.externalMetrics,
      fees: FEE_SCHEDULE,
    };
  });

export const registerExternal = (userId: string, input: Record<string, unknown>) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    const asset = {
      id: String(input.id || ""),
      symbol: String(input.symbol || ""),
      decimals: Number(input.decimals ?? 18),
      chain: String(input.chain || ""),
      token: String(input.token || ""),
      eventName: String(input.eventName || "TokenLocked"),
      topic: String(input.topic || ""),
      confirmations: Number(input.confirmations ?? 12),
      minSources: Number(input.minSources ?? 2),
      rpcs: Array.isArray(input.rpcs) ? input.rpcs.map(String) : [],
      enabled: input.enabled !== false,
    };
    try {
      validateAsset(asset);
    } catch (err) {
      throw new ZendoError(err instanceof Error ? err.message : "Invalid asset.", 400);
    }
    if (registryOf(state).some((row) => row.id === asset.id)) throw new ZendoError("That synthetic id is already registered.", 400);
    state.externalAssets.push(asset);
    log(state, user.address, "external-register", asset.id);
    return { id: asset.id, count: registryOf(state).length };
  });

export const observeExternal = (userId: string, observations: Observation[]) =>
  mutate((state) => {
    const user = userByIdSync(state, userId);
    if (user.role !== "admin") throw new ZendoError("Operator access only.", 403);
    assertSimulationAllowed("Synthetic asset mint/burn");
    state.externalMetrics.ingested += 1;
    let judgment;
    try {
      judgment = judge(state, observations);
    } catch (err) {
      throw new ZendoError(err instanceof Error ? err.message : "Observation rejected.", 400);
    }
    if (judgment.action === "quarantine") {
      state.externalQuarantine.unshift({ key: judgment.key, reason: judgment.reason, at: Date.now() });
      state.externalMetrics.quarantined += 1;
      state.externalSeen.push(judgment.key);
      logEvent("oracle", { kind: "quarantine", key: judgment.key, reason: judgment.reason });
      return { status: "quarantine", reason: judgment.reason };
    }
    const account = Object.values(state.accounts).find((row) => row.address === judgment.account);
    if (!account) throw new ZendoError("Unknown Zendo account.", 404);
    if (judgment.action === "mint") {
      credit(state, judgment.account, judgment.synthetic, judgment.amount);
      state.externalMetrics.minted += 1;
    } else {
      debit(state, judgment.account, judgment.synthetic, judgment.amount, judgment.synthetic);
      state.externalMetrics.burned += 1;
    }
    state.externalSeen.push(judgment.key);
    logEvent("oracle", { kind: judgment.action, asset: judgment.assetId, amount: judgment.amount.toString() });
    pushTx(state, {
      at: Date.now(),
      type: judgment.action === "mint" ? "synthetic-mint" : "synthetic-burn",
      from: judgment.action === "mint" ? SYSTEM.treasury : judgment.account,
      to: judgment.action === "mint" ? judgment.account : SYSTEM.treasury,
      token: judgment.synthetic,
      symbol: judgment.assetId,
      amount: judgment.amount.toString(),
      amountDisplay: judgment.amount.toString(),
      fee: "0",
      feeDisplay: "0",
      summary: `${judgment.action} ${judgment.synthetic}`,
      gasUsed: 21_000,
    });
    return { status: judgment.action, asset: judgment.synthetic, amount: judgment.amount.toString() };
  });

export function sessionUser(user: User): PublicUser {
  return toPublic(user);
}

export { peers };
