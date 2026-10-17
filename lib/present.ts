import { getConfig } from "./config";
import {
  compactUnits,
  formatPct,
  formatPrice,
  formatToken,
  formatUnits,
  formatZ,
  priceNumber,
  TOKEN_UNIT,
  Z_DECIMALS,
} from "./format";
import { pendingReward, splitReward } from "./rewards";
import { statfsSync } from "fs";
import { ledgerBytes } from "./ledger-store";
import { dataDir } from "./paths";
import { ENGINE_CHECK } from "./engine-check";
import { PARAMS } from "./params";
import { SYSTEM, type Coin, type State, type User } from "./state";
import { vestedAmount, vestingSchedule } from "./vesting";
import { founderUnits, founderVestingAddress, founderWalletAddress, ZENDO_FOUNDERS } from "./zendo-founders";
import { PUBLIC_ALLOCATION_Z, supplyUnits } from "./zendo-supply";
import type {
  AddressDetail,
  AdminView,
  BlockDetail,
  BlockRow,
  ChainStatus,
  CoinCard,
  CoinDetail,
  FeeSchedule,
  HomeView,
  PeerRow,
  GrantsView,
  MarketView,
  ProposalRow,
  PublicUser,
  QuoteView,
  StatsView,
  TxRow,
  ValidatorRow,
  WalletView,
  ZcoinView,
} from "./types";
import { marketCap, spotPrice } from "./curve";

export function toPublic(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    address: user.address,
    role: user.role,
    referralCode: user.referralCode,
    premium: user.premium,
    createdAt: user.createdAt,
    ...(user.l1Address ? { l1Address: user.l1Address } : {}),
  };
}

export function labelOf(state: State, address: string): string {
  return state.accounts[address]?.label || `${address.slice(0, 8)}…${address.slice(-4)}`;
}

function reserves(coin: Coin): { z: bigint; tokens: bigint } {
  if (coin.venue === "pool") return { z: BigInt(coin.poolZ), tokens: BigInt(coin.poolTokens) };
  return { z: BigInt(coin.virtualZ), tokens: BigInt(coin.virtualTokens) };
}

function priceOf(coin: Coin): bigint {
  const side = reserves(coin);
  return spotPrice(side.z, side.tokens);
}

function volumeOf(coin: Coin, now: number): bigint {
  return coin.trades.reduce((sum, trade) => {
    if (now - trade.at > 24 * 60 * 60 * 1000) return sum;
    return sum + BigInt(trade.zBase);
  }, 0n);
}

export function scoreParts(coin: Coin, now: number) {
  const volume = Number(formatZ(volumeOf(coin, now), 4).replace(/,/g, ""));
  const votes = Object.values(coin.votes).reduce((sum, vote) => sum + vote, 0);
  const featured = coin.featuredUntil > now ? 800 : 0;
  const fresh = now - coin.createdAt < 12 * 60 * 60 * 1000 ? 40 : 0;
  const boost = coin.boost;
  return {
    volume: volume * 8,
    votes: votes * 6,
    featured,
    fresh,
    boost,
    total: volume * 8 + votes * 6 + featured + fresh + boost,
  };
}

export function coinScore(coin: Coin, now: number): number {
  return scoreParts(coin, now).total;
}

export function presentCoin(state: State, coin: Coin, now = Date.now()): CoinCard {
  const price = priceOf(coin);
  const cap = marketCap(price, BigInt(coin.totalSupply));
  const prices = coin.trades.map((trade) => trade.price).filter((value) => value > 0);
  const window = prices.slice(-24);
  const first = window[0] ?? 0;
  const last = window[window.length - 1] ?? 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const threshold = parseConfigZ(getConfig().graduationZ);
  const progress = coin.graduated ? 100 : Math.max(0, Math.min(100, Number((BigInt(coin.realZ) * 10_000n) / threshold) / 100));
  const chart = (window.length ? window : [priceNumber(reserves(coin).z, reserves(coin).tokens)]).slice(-36);
  return {
    mint: coin.mint,
    name: coin.name,
    symbol: coin.symbol,
    description: coin.description,
    emoji: coin.emoji,
    hue: coin.hue,
    creator: coin.creator,
    creatorName: labelOf(state, coin.creator),
    createdAt: coin.createdAt,
    graduated: coin.graduated,
    featured: coin.featuredUntil > now,
    marketCap: compactUnits(cap, Z_DECIMALS),
    price: formatPrice(price),
    change: formatPct(change),
    changeUp: change >= 0,
    volume: compactUnits(volumeOf(coin, now), Z_DECIMALS),
    replies: coin.replies.length,
    votes: Object.values(coin.votes).reduce((sum, vote) => sum + vote, 0),
    progress,
    chart: chart.length === 1 ? [chart[0], chart[0]] : chart,
  };
}

function parseConfigZ(value: string): bigint {
  const whole = BigInt(value.split(".")[0] || "0");
  return whole * 10n ** 18n;
}

export function presentCoinDetail(state: State, coin: Coin, viewer: User | null, now = Date.now()): CoinDetail {
  const card = presentCoin(state, coin, now);
  const holders = Object.values(state.accounts)
    .map((account) => ({ account, amount: BigInt(account.balances[coin.mint] || "0") }))
    .filter((row) => row.amount > 0n)
    .sort((a, b) => (a.amount > b.amount ? -1 : 1))
    .slice(0, 8);
  const supply = BigInt(coin.totalSupply);
  return {
    ...card,
    venue: coin.venue,
    realZ: formatZ(BigInt(coin.realZ), 2),
    graduationZ: getConfig().graduationZ,
    creatorFees: formatZ(BigInt(coin.creatorFees), 4),
    holders: holders.map((row) => ({
      address: row.account.address,
      name: row.account.label,
      amount: formatToken(row.amount, 2),
      pct: supply > 0n ? `${(Number((row.amount * 10_000n) / supply) / 100).toFixed(2)}%` : "0%",
    })),
    trades: [...coin.trades].reverse().slice(0, 40).map((trade) => ({
      id: trade.id,
      at: trade.at,
      side: trade.side,
      address: trade.address,
      name: labelOf(state, trade.address),
      z: formatZ(BigInt(trade.zBase), 4),
      tokens: formatToken(BigInt(trade.tokenBase), 2),
      price: trade.price.toPrecision(4),
    })),
    replyRows: [...coin.replies].reverse(),
    yourTokens: viewer ? formatToken(BigInt(state.accounts[viewer.address]?.balances[coin.mint] || "0"), 4) : null,
    yourAddress: viewer?.address ?? null,
    youVoted: viewer ? state.accounts[viewer.address] && coin.votes[viewer.address] ? coin.votes[viewer.address] : 0 : 0,
  };
}

export function presentTx(state: State, tx: State["txs"][number]): TxRow {
  return {
    hash: tx.hash,
    height: tx.height,
    at: tx.at,
    type: tx.type,
    from: tx.from,
    to: tx.to,
    fromName: labelOf(state, tx.from),
    toName: labelOf(state, tx.to),
    symbol: tx.symbol,
    amount: tx.amountDisplay,
    fee: tx.feeDisplay,
    summary: tx.summary,
    gasUsed: tx.gasUsed,
  };
}

export function presentBlock(state: State, block: State["blocks"][number]): BlockRow {
  const depth = getConfig().finalityDepth;
  return {
    height: block.height,
    hash: block.hash,
    parent: block.parent,
    at: block.at,
    proposer: block.proposer,
    proposerName: block.proposerName,
    txCount: block.txHashes.length,
    gasUsed: block.gasUsed,
    stateRoot: block.stateRoot,
    pohSlot: block.pohSlot,
    finalized: state.height - block.height >= depth,
  };
}

export function presentBlockDetail(state: State, block: State["blocks"][number]): BlockDetail {
  const hashes = new Set(block.txHashes);
  const txs = state.txs.filter((tx) => hashes.has(tx.hash)).map((tx) => presentTx(state, tx));
  return { ...presentBlock(state, block), txs };
}

export function presentAddress(state: State, address: string): AddressDetail | null {
  const account = state.accounts[address];
  if (!account) return null;
  const balances = Object.entries(account.balances).map(([mint, amount]) => {
    if (mint === "ZCOIN") return { symbol: "ZCOIN", mint, amount: formatZ(BigInt(amount), 4) };
    const coin = state.coins.find((item) => item.mint === mint);
    return { symbol: coin?.symbol || mint.slice(0, 8), mint, amount: formatToken(BigInt(amount), 4) };
  });
  const txs = state.txs
    .filter((tx) => tx.from === address || tx.to === address)
    .slice(-30)
    .reverse()
    .map((tx) => presentTx(state, tx));
  return { address, name: account.label, nonce: account.nonce, balances, txs };
}

function avgBlockMs(state: State): number {
  const recent = state.blocks.slice(-20);
  const deltas: number[] = [];
  for (let i = 1; i < recent.length; i += 1) {
    const delta = recent[i].at - recent[i - 1].at;
    if (delta > 0 && delta < 120_000) deltas.push(delta);
  }
  if (!deltas.length) return getConfig().blockTimeMs;
  return Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length);
}

export function presentStatus(state: State, now = Date.now()): ChainStatus {
  const cfg = getConfig();
  const recent = state.txs.filter((tx) => tx.type !== "heartbeat" && now - tx.at <= 60_000).length;
  const active = state.validators.filter((validator) => validator.status === "active").length;
  return {
    networkId: state.networkId,
    chainName: cfg.chainName,
    height: Math.max(0, state.height),
    finalizedHeight: Math.max(0, state.height - cfg.finalityDepth),
    blockTimeMs: cfg.blockTimeMs,
    avgBlockMs: avgBlockMs(state),
    tps: Math.round((recent / 60) * 100) / 100,
    mempool: state.mempool.length,
    peers: 8,
    coins: state.coins.filter((coin) => !coin.hidden).length,
    accounts: Object.keys(state.accounts).length,
    validators: active,
    poh: cfg.pohEnabled,
    lastBlockAt: state.lastBlockAt,
    version: "0.9.4",
  };
}

export function presentFees(): FeeSchedule {
  const cfg = getConfig();
  return {
    transfer: cfg.gas.transfer,
    createCoin: cfg.gas.createCoin,
    tradeGas: cfg.gas.trade,
    tradePct: (cfg.tradeBps / 100).toFixed(2),
    creatorPct: (cfg.creatorBps / 100).toFixed(2),
    vote: cfg.gas.vote,
    proposal: cfg.gas.proposal,
    promote: cfg.gas.promote,
    stake: cfg.gas.stake,
    apr: (cfg.aprBps / 100).toFixed(2),
    graduation: cfg.graduationZ,
    airdrop: cfg.airdrop,
  };
}

export function presentValidators(state: State): ValidatorRow[] {
  const cfg = getConfig();
  return state.validators.map((validator) => {
    const delegated = state.stakes
      .filter((stake) => stake.validatorId === validator.id)
      .reduce((sum, stake) => sum + BigInt(stake.amount), 0n);
    const netBps = Math.max(0, cfg.aprBps - Math.round((cfg.aprBps * validator.commissionBps) / 10_000));
    return {
      id: validator.id,
      moniker: validator.moniker,
      address: validator.address,
      commission: (validator.commissionBps / 100).toFixed(2),
      status: validator.status,
      region: validator.region,
      uptime: (validator.uptimeBps / 100).toFixed(2),
      selfStake: compactUnits(BigInt(validator.selfStake), Z_DECIMALS),
      delegated: compactUnits(delegated, Z_DECIMALS),
      proposed: validator.proposed,
      apr: (netBps / 100).toFixed(2),
    };
  });
}

export function presentWallet(state: State, user: User, now = Date.now()): WalletView {
  const cfg = getConfig();
  const account = state.accounts[user.address];
  const z = BigInt(account?.balances.ZCOIN || "0");
  const synthetics = Object.entries(account?.balances || {})
    .filter(([token, amount]) => token.startsWith("syn:") && BigInt(amount) > 0n)
    .map(([token, amount]) => ({ id: token.slice(4), amount }));
  const tokens = state.coins.flatMap((coin) => {
    const amount = BigInt(account?.balances[coin.mint] || "0");
    if (amount <= 0n) return [];
    const value = (priceOf(coin) * amount) / TOKEN_UNIT;
    return [{ mint: coin.mint, symbol: coin.symbol, emoji: coin.emoji, amount: formatToken(amount, 4), value: formatZ(value, 4) }];
  });
  const stakes = state.stakes.filter((stake) => stake.address === user.address).map((stake) => {
    const validator = state.validators.find((item) => item.id === stake.validatorId);
    const gross = pendingReward(BigInt(stake.amount), BigInt(stake.accrued), stake.rewardsSettledAt, now, cfg.aprBps);
    const split = splitReward(gross, validator?.commissionBps ?? 0);
    return {
      id: stake.id,
      validatorId: stake.validatorId,
      moniker: validator?.moniker || "Validator",
      amount: formatZ(BigInt(stake.amount), 4),
      pending: formatZ(gross, 6),
      netPending: formatZ(split.net, 6),
    };
  });
  const pendingRewards = state.stakes
    .filter((stake) => stake.address === user.address)
    .reduce((sum, stake) => {
      const validator = state.validators.find((item) => item.id === stake.validatorId);
      const gross = pendingReward(BigInt(stake.amount), BigInt(stake.accrued), stake.rewardsSettledAt, now, cfg.aprBps);
      return sum + splitReward(gross, validator?.commissionBps ?? 0).net;
    }, 0n);
  return {
    user: toPublic(user),
    zcoin: formatZ(z, 4),
    zcoinRaw: formatZ(z, 6).replace(/,/g, ""),
    tokens,
    synthetics,
    stakes,
    unbonding: state.unbonding
      .filter((row) => row.address === user.address)
      .map((row) => ({
        id: row.id,
        amount: formatZ(BigInt(row.amount), 4),
        readyHeight: row.readyHeight,
        ready: state.height >= row.readyHeight,
      })),
    txs: state.txs
      .filter((tx) => tx.from === user.address || tx.to === user.address)
      .slice(-20)
      .reverse()
      .map((tx) => presentTx(state, tx)),
    pendingRewards: formatZ(pendingRewards, 6),
    notices: state.notices.filter((notice) => notice.userId === user.id).slice(0, 20),
    referralCount: state.users.filter((item) => item.referredBy === user.id).length,
  };
}

export function presentMarket(state: State, viewer: User | null): MarketView {
  const counts = new Map<string, number>();
  for (const user of state.users) {
    if (!user.referredBy) continue;
    counts.set(user.referredBy, (counts.get(user.referredBy) || 0) + 1);
  }
  const leaders = [...counts.entries()]
    .map(([id, count]) => {
      const user = state.users.find((item) => item.id === id);
      return user ? { name: user.displayName, code: user.referralCode, count } : null;
    })
    .filter((row): row is { name: string; code: string; count: number } => row !== null)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 8);
  return {
    yourCode: viewer?.referralCode ?? null,
    leaders,
    listings: state.listings
      .map((listing) => {
        const scores = Object.values(listing.ratings);
        const total = scores.reduce((sum, score) => sum + score, 0);
        const author = state.users.find((item) => item.address === listing.author);
        const boost = author ? counts.get(author.id) || 0 : 0;
        return {
          id: listing.id,
          name: listing.name,
          summary: listing.summary,
          kind: listing.kind,
          authorName: listing.authorName,
          createdAt: listing.createdAt,
          rating: scores.length ? Math.round((total / scores.length) * 10) / 10 : 0,
          votes: scores.length,
          yours: viewer ? listing.ratings[viewer.address] ?? null : null,
          boost,
        };
      })
      .sort((left, right) => right.rating * 10 + right.votes + right.boost - (left.rating * 10 + left.votes + left.boost) || right.createdAt - left.createdAt),
  };
}

export function presentGrants(state: State, viewer: User | null, lockMs: number, now = Date.now()): GrantsView {
  const quorum = parseConfigZ("1000");
  return {
    treasury: formatZ(BigInt(state.accounts[SYSTEM.treasury]?.balances.ZCOIN || "0"), 2),
    lockSeconds: Math.round(lockMs / 1000),
    grants: state.grants.map((grant) => {
      let yes = 0n;
      let no = 0n;
      for (const vote of Object.values(grant.votes)) {
        const weight = BigInt(vote.weight);
        if (vote.choice === "yes") yes += weight;
        else no += weight;
      }
      const cast = yes + no;
      const passed = cast >= quorum && yes > no;
      return {
        id: grant.id,
        title: grant.title,
        body: grant.body,
        milestone: grant.milestone,
        amount: formatZ(BigInt(grant.amount), 2),
        authorName: grant.authorName,
        createdAt: grant.createdAt,
        unlockAt: grant.unlockAt,
        status: grant.status,
        yes: compactUnits(yes, Z_DECIMALS),
        no: compactUnits(no, Z_DECIMALS),
        yesPct: cast > 0n ? Number((yes * 10_000n) / cast) / 100 : 0,
        quorumMet: cast >= quorum,
        passed,
        locked: now < grant.unlockAt,
        yourVote: viewer ? grant.votes[viewer.address]?.choice ?? null : null,
      };
    }),
  };
}

export function presentProposals(state: State, viewer: User | null, now = Date.now()): ProposalRow[] {
  const quorum = parseConfigZ("1000");
  return state.proposals.map((proposal) => {
    let yes = 0n;
    let no = 0n;
    let abstain = 0n;
    for (const vote of Object.values(proposal.votes)) {
      const weight = BigInt(vote.weight);
      if (vote.choice === "yes") yes += weight;
      else if (vote.choice === "no") no += weight;
      else abstain += weight;
    }
    const cast = yes + no;
    const yesPct = cast > 0n ? Number((yes * 10_000n) / cast) / 100 : 0;
    let status = proposal.status;
    if (status === "active" && now >= proposal.endsAt) {
      status = cast >= quorum && yes > no ? "passed" : "rejected";
    }
    return {
      id: proposal.id,
      title: proposal.title,
      body: proposal.body,
      authorName: proposal.authorName,
      createdAt: proposal.createdAt,
      endsAt: proposal.endsAt,
      status,
      yes: compactUnits(yes, Z_DECIMALS),
      no: compactUnits(no, Z_DECIMALS),
      abstain: compactUnits(abstain, Z_DECIMALS),
      yesPct,
      quorumMet: cast >= quorum,
      yourVote: viewer ? proposal.votes[viewer.address]?.choice ?? null : null,
      change: proposal.change ? `${proposal.change.key} = ${proposal.change.value}` : null,
    };
  });
}

function founderBooks(state: State, now: number) {
  const cfg = getConfig();
  const anchor = state.publicLaunchAt;
  return ZENDO_FOUNDERS.map((founder) => {
    const total = founderUnits(founder.amount);
    const claimed = BigInt(state.founderClaims?.[founder.id] || "0");
    const vested = anchor == null ? 0n : vestedAmount(total, anchor, now, cfg.cliffDays, cfg.vestingYears, cfg.yearlyUnlockBps);
    const claimable = vested > claimed ? vested - claimed : 0n;
    return {
      id: founder.id,
      name: founder.name,
      role: founder.role,
      polygon: founder.polygon,
      total,
      claimed,
      vested,
      claimable,
      vestingAddress: founderVestingAddress(founder.id),
      walletAddress: founderWalletAddress(founder.id),
    };
  });
}

export function presentHome(state: State, now = Date.now()): HomeView {
  const cfg = getConfig();
  const books = founderBooks(state, now);
  const founder = books.reduce((sum, row) => sum + row.total, 0n);
  const unlocked = books.reduce((sum, row) => sum + row.vested, 0n);
  const claimed = books.reduce((sum, row) => sum + row.claimed, 0n);
  const coins = state.coins
    .filter((coin) => !coin.hidden)
    .sort((a, b) => coinScore(b, now) - coinScore(a, now))
    .slice(0, 6)
    .map((coin) => presentCoin(state, coin, now));
  return {
    status: presentStatus(state, now),
    coins,
    fees: presentFees(),
    vesting: {
      anchor: state.publicLaunchAt,
      launched: state.publicLaunchAt != null,
      cliffDays: cfg.cliffDays,
      years: cfg.vestingYears,
      unlockedPct: founder > 0n ? `${(Number((unlocked * 10_000n) / founder) / 100).toFixed(0)}%` : "0%",
      claimable: formatZ(unlocked > claimed ? unlocked - claimed : 0n, 2),
      founder: compactUnits(founder, Z_DECIMALS),
    },
  };
}

export function presentZcoin(state: State, now = Date.now()): ZcoinView {
  const cfg = getConfig();
  const books = founderBooks(state, now);
  const founder = books.reduce((sum, row) => sum + row.total, 0n);
  const vested = books.reduce((sum, row) => sum + row.vested, 0n);
  const claimed = books.reduce((sum, row) => sum + row.claimed, 0n);
  const claimable = books.reduce((sum, row) => sum + row.claimable, 0n);
  const locked = books.reduce((sum, row) => sum + BigInt(state.accounts[row.vestingAddress]?.balances.ZCOIN || "0"), 0n);
  const staked =
    state.validators.reduce((sum, validator) => sum + BigInt(validator.selfStake), 0n) +
    state.stakes.reduce((sum, stake) => sum + BigInt(stake.amount), 0n) +
    state.unbonding.reduce((sum, row) => sum + BigInt(row.amount), 0n);
  const balances = Object.values(state.accounts).reduce((sum, account) => sum + BigInt(account.balances.ZCOIN || "0"), 0n);
  const liquid = balances > locked ? balances - locked : 0n;
  return {
    name: "ZendoCoin",
    symbol: "$ZCoin",
    decimals: 18,
    supply: compactUnits(parseConfigZ(cfg.supply), Z_DECIMALS),
    issuedRewards: formatZ(BigInt(state.issuedRewards), 4),
    founder: compactUnits(founder, Z_DECIMALS),
    publicAllocation: compactUnits(supplyUnits(PUBLIC_ALLOCATION_Z), Z_DECIMALS),
    vested: compactUnits(vested, Z_DECIMALS),
    claimed: compactUnits(claimed, Z_DECIMALS),
    claimable: formatZ(claimable, 4),
    faucet: compactUnits(BigInt(state.accounts[SYSTEM.faucet]?.balances.ZCOIN || "0"), Z_DECIMALS),
    treasury: compactUnits(BigInt(state.accounts[SYSTEM.treasury]?.balances.ZCOIN || "0"), Z_DECIMALS),
    community: compactUnits(BigInt(state.accounts[SYSTEM.community]?.balances.ZCOIN || "0"), Z_DECIMALS),
    staked: compactUnits(staked, Z_DECIMALS),
    liquid: compactUnits(liquid, Z_DECIMALS),
    anchor: state.publicLaunchAt,
    launched: state.publicLaunchAt != null,
    cliffDays: cfg.cliffDays,
    years: cfg.vestingYears,
    schedule: (state.publicLaunchAt == null
      ? vestingSchedule(founder, now + 365 * 24 * 60 * 60 * 1000, now, cfg.cliffDays, cfg.vestingYears, cfg.yearlyUnlockBps).map((row) => ({
          ...row,
          at: 0,
          unlocked: false,
        }))
      : vestingSchedule(founder, state.publicLaunchAt, now, cfg.cliffDays, cfg.vestingYears, cfg.yearlyUnlockBps)
    ).map((row) => ({
      label: row.label,
      at: row.at,
      amount: formatZ(row.amount, 2),
      unlocked: row.unlocked,
    })),
    founders: books.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      allocation: compactUnits(row.total, Z_DECIMALS),
      vested: compactUnits(row.vested, Z_DECIMALS),
      claimed: compactUnits(row.claimed, Z_DECIMALS),
      claimable: formatZ(row.claimable, 2),
      vestingAddress: row.vestingAddress,
      walletAddress: row.walletAddress,
      polygon: row.polygon,
    })),
    contract: books[0]?.vestingAddress || SYSTEM.community,
  };
}

export function presentQuote(input: {
  side: "buy" | "sell";
  capped: boolean;
  gross: bigint;
  tokens: bigint;
  fee: bigint;
  creatorFee: bigint;
  protocolFee: bigint;
  gas: bigint;
  proceeds: bigint;
  price: bigint;
  impact: number;
  graduated: boolean;
}): QuoteView {
  const total = input.side === "buy" ? input.gross + input.gas : input.proceeds;
  return {
    side: input.side,
    capped: input.capped,
    spend: formatZ(input.gross, 6),
    tokens: formatToken(input.tokens, 4),
    fee: formatZ(input.fee, 6),
    creatorFee: formatZ(input.creatorFee, 6),
    protocolFee: formatZ(input.protocolFee, 6),
    gas: formatZ(input.gas, 6),
    total: formatZ(total, 6),
    proceeds: formatZ(input.side === "sell" ? input.proceeds : 0n, 6),
    price: formatPrice(input.price),
    impact: formatPct(input.impact),
    graduated: input.graduated,
  };
}

export function peers(now = Date.now()): PeerRow[] {
  const regions = ["ashburn", "frankfurt", "singapore", "dublin", "sao-paulo", "tokyo", "sydney", "montreal"];
  return regions.map((region, index) => ({
    id: `peer_${index + 1}`,
    address: `zndp://${region}.zendo:${26656 + index}`,
    region,
    latencyMs: 18 + ((now / 1000 + index * 17) % 40),
    version: "0.9.4",
    status: "connected" as const,
  }));
}

function weightOf(votes: Record<string, { choice: string; weight: string }>, choice: string) {
  return Object.values(votes).reduce((sum, vote) => (vote.choice === choice ? sum + BigInt(vote.weight) : sum), 0n);
}

function presentPeople(state: State) {
  return state.users.slice(0, 200).map((user) => {
    const liquid = BigInt(state.accounts[user.address]?.balances.ZCOIN || "0");
    const staked = state.stakes.filter((stake) => stake.address === user.address).reduce((sum, stake) => sum + BigInt(stake.amount), 0n);
    const created = state.coins.filter((coin) => coin.creator === user.address);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      address: user.address,
      role: user.role,
      banned: Boolean(user.banned),
      premium: user.premium,
      createdAt: user.createdAt,
      zcoin: formatZ(liquid, 4),
      staked: formatZ(staked, 4),
      power: formatZ(liquid + staked, 4),
      coinsCreated: created.length,
      trades: state.coins.reduce((sum, coin) => sum + coin.trades.filter((trade) => trade.address === user.address).length, 0),
      coinVotes: state.coins.reduce((sum, coin) => sum + (coin.votes[user.address] ? 1 : 0), 0),
    };
  });
}

function presentCoinMod(state: State, now: number) {
  return state.coins.slice(0, 80).map((coin) => {
    const grouped = new Map<string, number>();
    for (const report of state.reports) {
      if (report.mint !== coin.mint) continue;
      grouped.set(report.reason, (grouped.get(report.reason) || 0) + 1);
    }
    return {
      mint: coin.mint,
      name: coin.name,
      symbol: coin.symbol,
      hidden: coin.hidden,
      createdAt: coin.createdAt,
      graduated: coin.graduated,
      reportCount: [...grouped.values()].reduce((sum, count) => sum + count, 0),
      reports: [...grouped.entries()].map(([reason, count]) => ({ reason, count })),
      promotions: coin.promotions || [],
      score: scoreParts(coin, now),
    };
  });
}

function liveParameters() {
  const cfg = getConfig();
  const values: Record<string, string> = {
    block_time_ms: String(cfg.blockTimeMs),
    finality_depth: String(cfg.finalityDepth),
    trade_bps: String(cfg.tradeBps),
    creator_bps: String(cfg.creatorBps),
    apr_bps: String(cfg.aprBps),
    graduation_z: cfg.graduationZ,
    min_delegate: cfg.minDelegate,
    unbonding_blocks: String(cfg.unbondingBlocks),
    mev: cfg.features.mev ? "on" : "off",
    gas_transfer: cfg.gas.transfer,
    gas_trade: cfg.gas.trade,
    gas_vote: cfg.gas.vote,
    gas_stake: cfg.gas.stake,
    gas_proposal: cfg.gas.proposal,
    gas_create_coin: cfg.gas.createCoin,
    gas_promote: cfg.gas.promote,
  };
  return PARAMS.map((item) => ({ key: item.key, label: item.label, value: values[item.key] || "" }));
}

function presentHealth(state: State) {
  let stateBytes = 0;
  let diskFree = 0;
  let diskTotal = 0;
  try {
    stateBytes = ledgerBytes();
  } catch {
    stateBytes = 0;
  }
  try {
    const disk = statfsSync(dataDir());
    diskFree = Number(disk.bavail) * Number(disk.bsize);
    diskTotal = Number(disk.blocks) * Number(disk.bsize);
  } catch {
    diskFree = 0;
    diskTotal = 0;
  }
  return {
    height: Math.max(0, state.height),
    lastBlockAt: state.lastBlockAt,
    accounts: Object.keys(state.accounts).length,
    users: state.users.length,
    tickets: (state.tickets || []).length,
    coins: state.coins.length,
    stateBytes,
    diskFree,
    diskTotal,
    testsPassed: ENGINE_CHECK.passed,
    testsFailed: ENGINE_CHECK.failed,
    testsRecordedAt: ENGINE_CHECK.recordedAt,
  };
}

export function presentAdmin(state: State, now = Date.now()): AdminView {
  return {
    status: presentStatus(state, now),
    peers: peers(now),
    counters: state.counters,
    rejections: state.rejections.slice(-12).reverse(),
    revenue: {
      gas: formatZ(BigInt(state.revenue.gas), 4),
      trade: formatZ(BigInt(state.revenue.trade), 4),
      create: formatZ(BigInt(state.revenue.create), 4),
      promote: formatZ(BigInt(state.revenue.promote), 4),
      mev: formatZ(BigInt(state.revenue.mev), 4),
    },
    mevEnabled: state.mevEnabled,
    validators: presentValidators(state),
    reports: state.reports.slice(0, 30).map((report) => ({
      id: report.id,
      at: report.at,
      mint: report.mint,
      symbol: state.coins.find((coin) => coin.mint === report.mint)?.symbol || "?",
      reason: report.reason,
      detail: report.detail,
      open: report.open,
    })),
    contacts: state.contacts.slice(0, 30),
    tickets: (state.tickets || []).slice(0, 80).map((ticket) => ({
      id: ticket.id,
      userId: ticket.userId,
      displayName: ticket.displayName,
      subject: ticket.subject,
      category: ticket.category,
      body: ticket.body,
      attachmentName: ticket.attachmentName,
      attachmentType: ticket.attachmentType,
      attachmentData: ticket.attachmentData,
      status: (ticket.status as string) === "answered" ? "resolved" : ticket.status,
      createdAt: ticket.createdAt,
      replies: ticket.replies || [],
      notes: ticket.notes || [],
    })),
    mailbox: state.mailbox.slice(0, 20).map((mail) => ({
      id: mail.id,
      at: mail.at,
      to: mail.to,
      subject: mail.subject,
      link: mail.link,
    })),
    audit: state.audit.slice(0, 40),
    users: state.users.length,
    people: presentPeople(state),
    coinsMod: presentCoinMod(state, now),
    proposals: state.proposals.slice(0, 40).map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      status: proposal.status,
      authorName: proposal.authorName,
      change: proposal.change ? `${proposal.change.key} = ${proposal.change.value}` : "No parameter",
      yes: formatZ(weightOf(proposal.votes, "yes"), 4),
      no: formatZ(weightOf(proposal.votes, "no"), 4),
      abstain: formatZ(weightOf(proposal.votes, "abstain"), 4),
      endsAt: proposal.endsAt,
    })),
    grants: (state.grants || []).slice(0, 40).map((grant) => ({
      id: grant.id,
      title: grant.title,
      authorName: grant.authorName,
      amount: formatZ(BigInt(grant.amount), 4),
      status: grant.status,
      createdAt: grant.createdAt,
    })),
    parameters: liveParameters(),
    health: presentHealth(state),
    forksResolved: state.forksResolved,
    height: Math.max(0, state.height),
    slashes: (state.slashes || []).slice(0, 12).map((slash) => ({
      id: slash.id,
      at: slash.at,
      moniker: slash.moniker,
      amount: formatZ(BigInt(slash.amount), 4),
      reason: slash.reason,
    })),
  };
}

export function presentStats(state: State, now = Date.now()): StatsView {
  const blocks = state.blocks.slice(-20);
  const times: number[] = [];
  for (let i = 1; i < blocks.length; i += 1) times.push(blocks[i].at - blocks[i - 1].at);
  const stake = state.validators
    .filter((validator) => validator.status === "active")
    .map((validator) => ({
      moniker: validator.moniker,
      amount: Number(formatUnits(BigInt(validator.selfStake), Z_DECIMALS, 2)),
    }));
  return {
    status: presentStatus(state, now),
    blockTimes: times,
    gas: blocks.map((block) => block.gasUsed),
    stake,
    fees: presentFees(),
    revenue: presentAdmin(state, now).revenue,
  };
}

export function contracts(state: State) {
  const cfg = getConfig();
  const base = [
    { name: "ZendoCoin", kind: "ZRC-20", address: "zcoin", detail: `${cfg.supply} base supply · ${18} decimals · ticker $ZCoin` },
    ...ZENDO_FOUNDERS.map((founder) => ({
      name: `${founder.name} vesting`,
      kind: "vesting",
      address: founderVestingAddress(founder.id),
      detail: `${founder.amount} Z locked · ${cfg.cliffDays}-day cliff · 25% each year`,
    })),
    { name: "Launchpad factory", kind: "factory", address: SYSTEM.studio, detail: "Bonding curve, then a seeded pool after graduation" },
    { name: "Polygon bridge vault", kind: "bridge", address: SYSTEM.bridge, detail: "Locks ZendoCoin for a signed Polygon release, and pays deposits from that vault" },
    { name: "Governance", kind: "governor", address: addressOfGov(), detail: "Token-weighted votes on recorded proposals" },
  ];
  const coins = state.coins.filter((coin) => !coin.hidden).map((coin) => ({
    name: coin.name,
    kind: coin.venue === "pool" ? "pool" : "curve",
    address: coin.mint,
    detail: `${coin.symbol} · ${coin.graduated ? "graduated pool" : "bonding curve"}`,
  }));
  return [...base, ...coins];
}

function addressOfGov(): string {
  return SYSTEM.community;
}
