import bcrypt from "bcryptjs";
import { getConfig } from "./config";
import type { ChainParams, ParamKey } from "./params";
import { ZENDO_OPERATOR } from "./seed";
import { parseUnits, Z_DECIMALS } from "./format";
import { addressFromLabel, addressFromPhrase, nid, phraseHash } from "./ids";
import { loadLedger, persistLedger, ledgerPath } from "./ledger-store";
import { loadLedgerPg, persistLedgerPg, usingPostgres } from "./ledger-pg";
import { phraseText } from "./words";
import { founderUnits, founderVestingAddress, founderWalletAddress, ZENDO_FOUNDERS } from "./zendo-founders";
import { describePublic, PUBLIC_BUCKETS, supplyUnits, TOTAL_SUPPLY_Z } from "./zendo-supply";

export const STATE_VERSION = 2;

export type Role = "user" | "creator" | "moderator" | "admin";

export type Account = {
  address: string;
  userId: string | null;
  label: string;
  balances: Record<string, string>;
  nonce: number;
};

export type User = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  pinHash: string;
  seedHash: string;
  address: string;
  role: Role;
  banned: boolean;
  referralCode: string;
  referredBy: string | null;
  premium: boolean;
  sessionVersion: number;
  pinAttempts: number;
  pinLockedUntil: number;
  createdAt: number;
  /**
   * The user's own zendo-1 public key (64 hex), supplied by the client after it derived the key from
   * a recovery phrase that never left the device. Present on non-custodial accounts; absent on the
   * legacy DEV/TEST accounts that still use a server-generated phrase.
   */
  publicKey?: string;
  /** The 40-hex zendo-1 address implied by `publicKey`; the authoritative on-chain identity. */
  l1Address?: string;
};

export type PendingUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  phraseHash: string;
  quizHashes: string[];
  address: string;
  quiz: number[];
  referralCode: string;
  referredBy: string | null;
  stage: "seed" | "pin";
  attempts: number;
  expires: number;
  /** "server" (legacy DEV/TEST), "client" (non-custodial signup), or "recover". */
  mode?: "server" | "client" | "recover";
  /** The client's public key for a client-mode signup. */
  publicKey?: string;
  /** The client's derived zendo-1 address for a client-mode signup. */
  l1Address?: string;
  /** A one-time challenge the client must sign to prove key possession. */
  challenge?: string;
  /** The account under recovery for a recover-mode pending row. */
  userId?: string;
};

export type CoinTrade = {
  id: string;
  at: number;
  side: "buy" | "sell";
  address: string;
  zBase: string;
  tokenBase: string;
  price: number;
};

export type Reply = {
  id: string;
  at: number;
  address: string;
  name: string;
  body: string;
};

export type JournalEntry = {
  id: string;
  at: number;
  debit: string;
  credit: string;
  asset: string;
  amount: string;
};

export type Coin = {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  emoji: string;
  hue: number;
  creator: string;
  creatorUserId: string | null;
  createdAt: number;
  hidden: boolean;
  featuredUntil: number;
  venue: "curve" | "pool";
  graduated: boolean;
  graduatedAt: number | null;
  initialZ: string;
  virtualZ: string;
  virtualTokens: string;
  k: string;
  realZ: string;
  tokensSold: string;
  saleSupply: string;
  totalSupply: string;
  poolZ: string;
  poolTokens: string;
  poolK: string;
  creatorFees: string;
  boost: number;
  promotions: { at: number; until: number; by: string }[];
  votes: Record<string, 1 | -1>;
  replies: Reply[];
  trades: CoinTrade[];
};

export type Tx = {
  hash: string;
  height: number | null;
  at: number;
  type: string;
  from: string;
  to: string;
  token: string;
  symbol: string;
  amount: string;
  amountDisplay: string;
  fee: string;
  feeDisplay: string;
  status: "finalized";
  summary: string;
  gasUsed: number;
};

export type Block = {
  height: number;
  hash: string;
  parent: string;
  at: number;
  proposer: string;
  proposerName: string;
  txHashes: string[];
  gasUsed: number;
  stateRoot: string;
  pohSlot: number | null;
};

export type Validator = {
  id: string;
  moniker: string;
  address: string;
  commissionBps: number;
  status: "active" | "pending" | "jailed";
  region: string;
  uptimeBps: number;
  selfStake: string;
  proposed: number;
};

export type Stake = {
  id: string;
  address: string;
  validatorId: string;
  amount: string;
  rewardsSettledAt: number;
  accrued: string;
};

export type Unbonding = {
  id: string;
  address: string;
  amount: string;
  readyHeight: number;
};

export type Slash = {
  id: string;
  at: number;
  validatorId: string;
  moniker: string;
  amount: string;
  reason: string;
};

export type Proposal = {
  id: string;
  title: string;
  body: string;
  author: string;
  authorName: string;
  createdAt: number;
  endsAt: number;
  status: "active" | "passed" | "rejected";
  votes: Record<string, { choice: "yes" | "no" | "abstain"; weight: string }>;
  change: { key: ParamKey; value: string } | null;
  applied: boolean;
};

export type Listing = {
  id: string;
  name: string;
  summary: string;
  kind: "contract" | "sdk" | "app";
  author: string;
  authorName: string;
  createdAt: number;
  ratings: Record<string, number>;
};

export type Grant = {
  id: string;
  title: string;
  body: string;
  milestone: string;
  amount: string;
  author: string;
  authorName: string;
  createdAt: number;
  unlockAt: number;
  status: "active" | "paid";
  paidAt: number | null;
  votes: Record<string, { choice: "yes" | "no"; weight: string }>;
};

export type Notice = {
  id: string;
  userId: string;
  title: string;
  body: string;
  href: string;
  at: number;
  read: boolean;
};

export type ContactNote = {
  id: string;
  at: number;
  name: string;
  email: string;
  topic: string;
  message: string;
};

export type TicketReply = {
  id: string;
  at: number;
  from: "user" | "operator";
  body: string;
};

export type TicketNote = {
  id: string;
  at: number;
  actor: string;
  body: string;
};

export type TicketStatus = "open" | "progress" | "resolved" | "closed";

export type Ticket = {
  id: string;
  userId: string;
  displayName: string;
  subject: string;
  category: string;
  body: string;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentData: string | null;
  status: TicketStatus;
  createdAt: number;
  replies: TicketReply[];
  notes: TicketNote[];
};

export type Mail = {
  id: string;
  at: number;
  to: string;
  subject: string;
  body: string;
  link: string;
};

export type ResetToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expires: number;
  used: boolean;
};

export type Report = {
  id: string;
  at: number;
  mint: string;
  address: string;
  reason: string;
  detail: string;
  open: boolean;
};

export type Audit = {
  id: string;
  at: number;
  actor: string;
  action: string;
  detail: string;
};

export type Rejection = {
  at: number;
  reason: string;
  kind: string;
};

export type Revenue = {
  gas: string;
  trade: string;
  create: string;
  promote: string;
  mev: string;
  synthetic: string;
};

export type ExternalAssetRecord = {
  id: string;
  symbol: string;
  decimals: number;
  chain: string;
  token: string;
  eventName: string;
  topic: string;
  confirmations: number;
  minSources: number;
  rpcs: string[];
  enabled: boolean;
};

export type ExternalQuarantine = { key: string; reason: string; at: number };

export type ExternalMetrics = {
  ingested: number;
  minted: number;
  burned: number;
  quarantined: number;
  fees: number;
};

export type BridgeWithdrawal = {
  id: string;
  nonce: number;
  from: string;
  recipient: string;
  amount: string;
  fee: string;
  signature: string;
  innerHash: string;
  signer: string;
  bridge: string;
  chainId: number;
  at: number;
  txHash: string;
};

export type BridgeDeposit = {
  id: string;
  key: string;
  polygonTx: string;
  logIndex: number;
  address: string;
  amount: string;
  at: number;
  txHash: string;
};

export type BridgeUnmatched = {
  key: string;
  txHash: string;
  logIndex: number;
  zendoHash: string;
  amount: string;
  blockNumber: string;
};

export type Follow = {
  userId: string;
  targetId: string;
  at: number;
};

export type SocialPost = {
  id: string;
  userId: string;
  body: string;
  at: number;
};

export type SocialStory = {
  id: string;
  userId: string;
  caption: string;
  at: number;
  expiresAt: number;
};

export type SocialVideo = {
  id: string;
  userId: string;
  title: string;
  caption: string;
  at: number;
};

export type Circle = {
  id: string;
  ownerId: string;
  name: string;
  memberIds: string[];
  at: number;
};

export type DirectMessage = {
  id: string;
  fromId: string;
  toId: string;
  body: string;
  at: number;
};

export type State = {
  version: number;
  networkId: string;
  genesisTime: number;
  publicLaunchAt: number | null;
  height: number;
  lastBlockAt: number;
  parentHash: string;
  issuedRewards: string;
  vestingClaimed: string;
  founderClaims: Record<string, string>;
  mevEnabled: boolean;
  accounts: Record<string, Account>;
  users: User[];
  pending: PendingUser[];
  coins: Coin[];
  txs: Tx[];
  mempool: Tx[];
  blocks: Block[];
  validators: Validator[];
  stakes: Stake[];
  unbonding: Unbonding[];
  slashes: Slash[];
  proposals: Proposal[];
  grants: Grant[];
  listings: Listing[];
  notices: Notice[];
  contacts: ContactNote[];
  tickets: Ticket[];
  mailbox: Mail[];
  resets: ResetToken[];
  reports: Report[];
  audit: Audit[];
  rejections: Rejection[];
  counters: { insufficient: number; malformed: number; signature: number };
  revenue: Revenue;
  forksResolved: number;
  params: ChainParams;
  bridgeNonce: number;
  bridgeWithdrawals: BridgeWithdrawal[];
  bridgeDeposits: BridgeDeposit[];
  bridgeReplay: string[];
  bridgeUnmatched: BridgeUnmatched[];
  bridgeScanBlock: string;
  follows: Follow[];
  posts: SocialPost[];
  stories: SocialStory[];
  videos: SocialVideo[];
  circles: Circle[];
  messages: DirectMessage[];
  externalAssets: ExternalAssetRecord[];
  externalSeen: string[];
  externalQuarantine: ExternalQuarantine[];
  externalMetrics: ExternalMetrics;
  journal: JournalEntry[];
  followerShard: boolean;
  shardExported: string;
  shardImported: string;
  outbox: import("./fleet").ShardReceipt[];
  shardReplay: string[];
  /** Highest zendo-1 block height whose confirmed transfers have been folded into this read model. */
  reconcileHeight?: number;
  /** L1 transaction ids already applied to this read model, so a replay never double counts. */
  reconcileApplied?: string[];
  /** Fees observed on reconciled L1 transfers, kept for the audit trail. */
  reconcileFees?: string;
  reconcileAt?: number;
  reconcileReport?: unknown;
};

export const SYSTEM = {
  treasury: addressFromLabel("treasury"),
  faucet: addressFromLabel("faucet"),
  vesting: addressFromLabel("vesting"),
  community: addressFromLabel("community"),
  studio: addressFromLabel("studio"),
  bridge: addressFromLabel("bridge"),
};

function operatorPin(): string {
  const pin = (process.env.ZENDO_OPERATOR_PIN || ZENDO_OPERATOR.pin).trim();
  if (!/^\d{4}$/.test(pin)) throw new Error("ZENDO_OPERATOR_PIN must be 4 digits.");
  return pin;
}

function account(address: string, label: string, balances: Record<string, string> = {}): Account {
  return { address, userId: null, label, balances, nonce: 0 };
}

export function createEmptyState(now = Date.now()): State {
  const cfg = getConfig();
  const supply = parseUnits(cfg.supply, Z_DECIMALS);
  if (supply !== supplyUnits(TOTAL_SUPPLY_Z)) {
    throw new Error("ZendoCoin base supply is fixed at 1,000,000,000.");
  }
  const pub = describePublic();

  const operatorPhrase = phraseText(ZENDO_OPERATOR.phrase);
  const operatorAddress = addressFromPhrase(operatorPhrase);
  const bots = Array.from({ length: PUBLIC_BUCKETS.botCount }, (_, index) => {
    const address = addressFromLabel(`bot-${index + 1}`);
    return account(address, `Public reserve ${index + 1}`, { ZCOIN: pub.botEach.toString() });
  });

  const validators: Validator[] = cfg.validators.map((validator, index) => ({
    id: `val_${String(index + 1).padStart(2, "0")}`,
    moniker: validator.moniker,
    address: addressFromLabel(`validator:${validator.moniker}`),
    commissionBps: validator.commissionBps,
    status: validator.status,
    region: validator.region,
    uptimeBps: validator.uptimeBps,
    selfStake: "0",
    proposed: 0,
  }));

  const accounts: Record<string, Account> = {
    [SYSTEM.treasury]: account(SYSTEM.treasury, "Protocol treasury", { ZCOIN: pub.treasury.toString() }),
    [SYSTEM.faucet]: account(SYSTEM.faucet, "Ecosystem faucet", {}),
    [SYSTEM.community]: account(SYSTEM.community, "Public allocation", { ZCOIN: pub.publicPool.toString() }),
    [SYSTEM.studio]: account(SYSTEM.studio, "Launchpad studio", { ZCOIN: pub.studio.toString() }),
    [SYSTEM.bridge]: account(SYSTEM.bridge, "Polygon bridge vault", {}),
    [operatorAddress]: account(operatorAddress, "System wallet · Zendo Operator", { ZCOIN: pub.operator.toString() }),
  };
  for (const founder of ZENDO_FOUNDERS) {
    const vesting = founderVestingAddress(founder.id);
    const wallet = founderWalletAddress(founder.id);
    accounts[vesting] = account(vesting, `${founder.name} vesting`, { ZCOIN: founderUnits(founder.amount).toString() });
    accounts[wallet] = account(wallet, `${founder.name} founder wallet`, {});
  }
  for (const bot of bots) accounts[bot.address] = bot;
  for (const validator of validators) {
    accounts[validator.address] = account(validator.address, validator.moniker, {});
  }

  const operator: User = {
    id: "usr_operator",
    email: ZENDO_OPERATOR.email,
    displayName: ZENDO_OPERATOR.displayName,
    passwordHash: bcrypt.hashSync((process.env.ZENDO_OPERATOR_PASSWORD || ZENDO_OPERATOR.password).trim(), 10),
    pinHash: bcrypt.hashSync(operatorPin(), 10),
    seedHash: phraseHash(operatorPhrase),
    address: operatorAddress,
    role: "admin",
    banned: false,
    referralCode: "OPERATOR",
    referredBy: null,
    premium: true,
    sessionVersion: 1,
    pinAttempts: 0,
    pinLockedUntil: 0,
    createdAt: cfg.genesisTime,
  };
  accounts[operatorAddress].userId = operator.id;

  const day = 24 * 60 * 60 * 1000;
  const proposals: Proposal[] = [
    {
      id: "prop_supply",
      title: "Anchor ZendoCoin base supply at 1,000,000,000",
      body: "Record the published base supply. Staking emissions are the only inflation on top of that anchor.",
      author: SYSTEM.studio,
      authorName: "Launchpad studio",
      createdAt: now - 10 * day,
      endsAt: now - day,
      status: "passed",
      votes: {
        [operatorAddress]: { choice: "yes", weight: parseUnits("100000", 18).toString() },
        [bots[0].address]: { choice: "yes", weight: pub.botEach.toString() },
        [bots[1].address]: { choice: "yes", weight: pub.botEach.toString() },
      },
      change: null,
      applied: true,
    },
    {
      id: "prop_fee",
      title: "Keep the launchpad trade fee at 1%",
      body: "Creator share stays 0.30% of notional. Protocol share stays 0.70%. Gas is charged on top.",
      author: operatorAddress,
      authorName: operator.displayName,
      createdAt: now - 2 * day,
      endsAt: now + 4 * day,
      status: "active",
      votes: {
        [bots[2].address]: { choice: "yes", weight: pub.botEach.toString() },
      },
      change: null,
      applied: false,
    },
    {
      id: "prop_saltworks",
      title: "Admit the Saltworks validator",
      body: "Saltworks is waiting in the pending set. A yes vote asks the operator to approve it from the node desk.",
      author: operatorAddress,
      authorName: operator.displayName,
      createdAt: now - day,
      endsAt: now + 5 * day,
      status: "active",
      votes: {},
      change: null,
      applied: false,
    },
  ];

  return {
    version: STATE_VERSION,
    networkId: cfg.networkId,
    genesisTime: cfg.genesisTime,
    publicLaunchAt: null,
    height: -1,
    lastBlockAt: now,
    parentHash: `0x${"00".repeat(32)}`,
    issuedRewards: "0",
    vestingClaimed: "0",
    founderClaims: {},
    mevEnabled: cfg.features.mev,
    accounts,
    users: [operator],
    pending: [],
    coins: [],
    txs: [],
    mempool: [],
    blocks: [],
    validators,
    stakes: [],
    unbonding: [],
    slashes: [],
    proposals,
    grants: [],
    listings: [],
    notices: [
      {
        id: nid("ntf"),
        userId: operator.id,
        title: "Zendo node is up",
        body: "Balances live in this process. Zendo does not hold a separate custodial wallet.",
        href: "/app",
        at: now,
        read: false,
      },
    ],
    contacts: [],
    tickets: [],
    mailbox: [],
    resets: [],
    reports: [],
    audit: [
      {
        id: nid("aud"),
        at: now,
        actor: "genesis",
        action: "genesis",
        detail: `${cfg.chainName} locked founder vesting. The public launch clock is not set.`,
      },
    ],
    rejections: [],
    counters: { insufficient: 0, malformed: 0, signature: 0 },
    revenue: { gas: "0", trade: "0", create: "0", promote: "0", mev: "0", synthetic: "0" },
    externalAssets: [],
    externalSeen: [],
    externalQuarantine: [],
    externalMetrics: { ingested: 0, minted: 0, burned: 0, quarantined: 0, fees: 0 },
    forksResolved: 0,
    params: {},
    bridgeNonce: 0,
    bridgeWithdrawals: [],
    bridgeDeposits: [],
    bridgeReplay: [],
    bridgeUnmatched: [],
    bridgeScanBlock: "0",
    follows: [],
    posts: [],
    stories: [],
    videos: [],
    circles: [],
    messages: [],
    journal: [],
    followerShard: false,
    shardExported: "0",
    shardImported: "0",
    outbox: [],
    shardReplay: [],
    reconcileHeight: 0,
    reconcileApplied: [],
    reconcileFees: "0",
    reconcileAt: 0,
    reconcileReport: null,
  };
}

export function stateFile(): string {
  return ledgerPath();
}

function normalizeState(parsed: State, replay: string[]): State | null {
  if (!parsed || parsed.version !== STATE_VERSION) return null;
  if (!Array.isArray(parsed.grants)) parsed.grants = [];
  if (!Array.isArray(parsed.listings)) parsed.listings = [];
  if (!Array.isArray(parsed.tickets)) parsed.tickets = [];
  if (!Array.isArray(parsed.bridgeReplay)) parsed.bridgeReplay = [];
  if (!Array.isArray(parsed.bridgeUnmatched)) parsed.bridgeUnmatched = [];
  if (typeof parsed.bridgeScanBlock !== "string") parsed.bridgeScanBlock = "0";
  if (typeof parsed.bridgeNonce !== "number") parsed.bridgeNonce = 0;
  if (typeof parsed.followerShard !== "boolean") parsed.followerShard = false;
  if (typeof parsed.shardExported !== "string") parsed.shardExported = "0";
  if (typeof parsed.shardImported !== "string") parsed.shardImported = "0";
  if (!Array.isArray(parsed.outbox)) parsed.outbox = [];
  if (!Array.isArray(parsed.shardReplay)) parsed.shardReplay = [];
  if (!Array.isArray(parsed.journal)) parsed.journal = [];
  if (typeof parsed.reconcileHeight !== "number") parsed.reconcileHeight = 0;
  if (!Array.isArray(parsed.reconcileApplied)) parsed.reconcileApplied = [];
  if (typeof parsed.reconcileFees !== "string") parsed.reconcileFees = "0";
  if (typeof parsed.reconcileAt !== "number") parsed.reconcileAt = 0;
  if (parsed.reconcileReport === undefined) parsed.reconcileReport = null;
  const keys = new Set(parsed.bridgeReplay);
  for (const key of replay) keys.add(key);
  parsed.bridgeReplay = [...keys];
  for (const key of parsed.bridgeReplay) {
    if (!key.startsWith("release:")) continue;
    const nonce = Number(key.split(":").pop());
    if (Number.isInteger(nonce) && nonce > parsed.bridgeNonce) parsed.bridgeNonce = nonce;
  }
  return parsed;
}

function stateFromRecord(loaded: { body: string; replay: string[] } | null): State | null {
  if (!loaded) return null;
  try {
    return normalizeState(JSON.parse(loaded.body) as State, loaded.replay);
  } catch (error) {
    console.error("Could not read chain state, starting fresh.", error);
    return null;
  }
}

export function readState(): State | null {
  if (usingPostgres()) return null;
  return stateFromRecord(loadLedger());
}

export async function readStateAsync(): Promise<State | null> {
  return stateFromRecord(usingPostgres() ? await loadLedgerPg() : loadLedger());
}

export function writeState(state: State) {
  if (!Array.isArray(state.bridgeReplay)) state.bridgeReplay = [];
  if (usingPostgres()) throw new Error("PostgreSQL commits go through writeStateAsync.");
  persistLedger(JSON.stringify(state), state.accounts, state.bridgeReplay);
}

export async function writeStateAsync(state: State) {
  if (!Array.isArray(state.bridgeReplay)) state.bridgeReplay = [];
  const body = JSON.stringify(state);
  if (usingPostgres()) await persistLedgerPg(body, state.accounts, state.bridgeReplay);
  else persistLedger(body, state.accounts, state.bridgeReplay);
}
