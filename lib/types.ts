export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  address: string;
  role: "user" | "creator" | "moderator" | "admin";
  referralCode: string;
  premium: boolean;
  createdAt: number;
  /** The user's 40-hex zendo-1 address, present when they hold their own on-chain key. */
  l1Address?: string;
};

export type ChainStatus = {
  networkId: string;
  chainName: string;
  height: number;
  finalizedHeight: number;
  blockTimeMs: number;
  avgBlockMs: number;
  tps: number;
  mempool: number;
  peers: number;
  coins: number;
  accounts: number;
  validators: number;
  poh: boolean;
  lastBlockAt: number;
  version: string;
};

export type CoinCard = {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  emoji: string;
  hue: number;
  creator: string;
  creatorName: string;
  createdAt: number;
  graduated: boolean;
  featured: boolean;
  marketCap: string;
  price: string;
  change: string;
  changeUp: boolean;
  volume: string;
  replies: number;
  votes: number;
  progress: number;
  chart: number[];
};

export type TradeRow = {
  id: string;
  at: number;
  side: "buy" | "sell";
  address: string;
  name: string;
  z: string;
  tokens: string;
  price: string;
};

export type ReplyRow = {
  id: string;
  at: number;
  address: string;
  name: string;
  body: string;
};

export type HolderRow = {
  address: string;
  name: string;
  amount: string;
  pct: string;
};

export type CoinDetail = CoinCard & {
  venue: "curve" | "pool";
  realZ: string;
  graduationZ: string;
  creatorFees: string;
  holders: HolderRow[];
  trades: TradeRow[];
  replyRows: ReplyRow[];
  yourTokens: string | null;
  yourAddress: string | null;
  youVoted: 1 | -1 | 0;
};

export type TxRow = {
  hash: string;
  height: number | null;
  at: number;
  type: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  symbol: string;
  amount: string;
  fee: string;
  summary: string;
  gasUsed: number;
};

export type BlockRow = {
  height: number;
  hash: string;
  parent: string;
  at: number;
  proposer: string;
  proposerName: string;
  txCount: number;
  gasUsed: number;
  stateRoot: string;
  pohSlot: number | null;
  finalized: boolean;
};

export type BlockDetail = BlockRow & { txs: TxRow[] };

export type AddressDetail = {
  address: string;
  name: string;
  nonce: number;
  balances: { symbol: string; mint: string; amount: string }[];
  txs: TxRow[];
};

export type FeeSchedule = {
  transfer: string;
  createCoin: string;
  tradeGas: string;
  tradePct: string;
  creatorPct: string;
  vote: string;
  proposal: string;
  promote: string;
  stake: string;
  apr: string;
  graduation: string;
  airdrop: string;
};

export type ValidatorRow = {
  id: string;
  moniker: string;
  address: string;
  commission: string;
  status: "active" | "pending" | "jailed";
  region: string;
  uptime: string;
  selfStake: string;
  delegated: string;
  proposed: number;
  apr: string;
};

export type StakeRow = {
  id: string;
  validatorId: string;
  moniker: string;
  amount: string;
  pending: string;
  netPending: string;
};

export type UnbondingRow = {
  id: string;
  amount: string;
  readyHeight: number;
  ready: boolean;
};

export type WalletView = {
  user: PublicUser;
  zcoin: string;
  zcoinRaw: string;
  tokens: { mint: string; symbol: string; emoji: string; amount: string; value: string }[];
  synthetics: { id: string; amount: string }[];
  stakes: StakeRow[];
  unbonding: UnbondingRow[];
  txs: TxRow[];
  pendingRewards: string;
  notices: NoticeRow[];
  referralCount: number;
};

export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  href: string;
  at: number;
  read: boolean;
};

export type GrantRow = {
  id: string;
  title: string;
  body: string;
  milestone: string;
  amount: string;
  authorName: string;
  createdAt: number;
  unlockAt: number;
  status: "active" | "paid";
  yes: string;
  no: string;
  yesPct: number;
  quorumMet: boolean;
  passed: boolean;
  locked: boolean;
  yourVote: "yes" | "no" | null;
};

export type ListingRow = {
  id: string;
  name: string;
  summary: string;
  kind: "contract" | "sdk" | "app";
  authorName: string;
  createdAt: number;
  rating: number;
  votes: number;
  yours: number | null;
  boost: number;
};

export type ReferralRow = {
  name: string;
  code: string;
  count: number;
};

export type MarketView = {
  listings: ListingRow[];
  leaders: ReferralRow[];
  yourCode: string | null;
};

export type GrantsView = {
  treasury: string;
  lockSeconds: number;
  grants: GrantRow[];
};

export type ProposalRow = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: number;
  endsAt: number;
  status: "active" | "passed" | "rejected";
  yes: string;
  no: string;
  abstain: string;
  yesPct: number;
  quorumMet: boolean;
  yourVote: "yes" | "no" | "abstain" | null;
  change: string | null;
};

export type HomeView = {
  status: ChainStatus;
  coins: CoinCard[];
  fees: FeeSchedule;
  vesting: {
    anchor: number | null;
    launched: boolean;
    cliffDays: number;
    years: number;
    unlockedPct: string;
    claimable: string;
    founder: string;
  };
};

export type FounderVestingRow = {
  id: string;
  name: string;
  role: string;
  allocation: string;
  vested: string;
  claimed: string;
  claimable: string;
  vestingAddress: string;
  walletAddress: string;
  polygon: string;
};

export type ZcoinView = {
  name: string;
  symbol: string;
  decimals: number;
  supply: string;
  issuedRewards: string;
  founder: string;
  publicAllocation: string;
  vested: string;
  claimed: string;
  claimable: string;
  faucet: string;
  treasury: string;
  community: string;
  staked: string;
  liquid: string;
  anchor: number | null;
  launched: boolean;
  cliffDays: number;
  years: number;
  schedule: { label: string; at: number; amount: string; unlocked: boolean }[];
  founders: FounderVestingRow[];
  contract: string;
};

export type QuoteView = {
  side: "buy" | "sell";
  capped: boolean;
  spend: string;
  tokens: string;
  fee: string;
  creatorFee: string;
  protocolFee: string;
  gas: string;
  total: string;
  proceeds: string;
  price: string;
  impact: string;
  graduated: boolean;
};

export type PeerRow = {
  id: string;
  address: string;
  region: string;
  latencyMs: number;
  version: string;
  status: "connected";
};

export type TicketReplyView = {
  id: string;
  at: number;
  from: "user" | "operator";
  body: string;
};

export type TicketNoteView = {
  id: string;
  at: number;
  actor: string;
  body: string;
};

export type TicketStatus = "open" | "progress" | "resolved" | "closed";

export type TicketView = {
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
  replies: TicketReplyView[];
  notes: TicketNoteView[];
};

export type AdminPerson = {
  id: string;
  email: string;
  displayName: string;
  address: string;
  role: PublicUser["role"];
  banned: boolean;
  premium: boolean;
  createdAt: number;
  zcoin: string;
  staked: string;
  power: string;
  coinsCreated: number;
  trades: number;
  coinVotes: number;
};

export type AdminCoin = {
  mint: string;
  name: string;
  symbol: string;
  hidden: boolean;
  createdAt: number;
  graduated: boolean;
  reportCount: number;
  reports: { reason: string; count: number }[];
  promotions: { at: number; until: number; by: string }[];
  score: { volume: number; votes: number; featured: number; fresh: number; boost: number; total: number };
};

export type AdminHealth = {
  height: number;
  lastBlockAt: number;
  accounts: number;
  users: number;
  tickets: number;
  coins: number;
  stateBytes: number;
  diskFree: number;
  diskTotal: number;
  testsPassed: number;
  testsFailed: number;
  testsRecordedAt: string;
};

export type AdminView = {
  status: ChainStatus;
  peers: PeerRow[];
  counters: { insufficient: number; malformed: number; signature: number };
  rejections: { at: number; reason: string; kind: string }[];
  revenue: { gas: string; trade: string; create: string; promote: string; mev: string };
  mevEnabled: boolean;
  validators: ValidatorRow[];
  reports: { id: string; at: number; mint: string; symbol: string; reason: string; detail: string; open: boolean }[];
  contacts: { id: string; at: number; name: string; email: string; topic: string; message: string }[];
  tickets: TicketView[];
  mailbox: { id: string; at: number; to: string; subject: string; link: string }[];
  audit: { id: string; at: number; actor: string; action: string; detail: string }[];
  users: number;
  people: AdminPerson[];
  coinsMod: AdminCoin[];
  proposals: { id: string; title: string; status: string; authorName: string; change: string; yes: string; no: string; abstain: string; endsAt: number }[];
  grants: { id: string; title: string; authorName: string; amount: string; status: string; createdAt: number }[];
  parameters: { key: string; label: string; value: string }[];
  health: AdminHealth;
  forksResolved: number;
  height: number;
  slashes: { id: string; at: number; moniker: string; amount: string; reason: string }[];
};

export type StatsView = {
  status: ChainStatus;
  blockTimes: number[];
  gas: number[];
  stake: { moniker: string; amount: number }[];
  fees: FeeSchedule;
  revenue: { gas: string; trade: string; create: string; promote: string; mev: string };
};

export type SearchKind = "user" | "coin" | "block" | "transaction" | "address" | "proposal";

export type SearchHit = {
  kind: SearchKind;
  title: string;
  detail: string;
  href: string;
};

export type SuggestView = {
  hits: SearchHit[];
  exact: { href: string } | null;
};

export type PersonCard = {
  id: string;
  displayName: string;
  role: "user" | "creator" | "moderator" | "admin";
  address: string;
};

export type PostCard = {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  at: number;
};

export type StoryCard = {
  id: string;
  userId: string;
  displayName: string;
  caption: string;
  at: number;
  expiresAt: number;
};

export type VideoCard = {
  id: string;
  userId: string;
  displayName: string;
  title: string;
  caption: string;
  at: number;
};

export type CircleCard = {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  members: PersonCard[];
  at: number;
};

export type MutualCard = PersonCard & { shared: boolean };

export type ProfileView = {
  person: PersonCard;
  followers: number;
  following: number;
  youFollow: boolean;
  followsYou: boolean;
  mutual: boolean;
  mutuals: MutualCard[];
  posts: PostCard[];
  stories: StoryCard[];
  videos: VideoCard[];
  circles: CircleCard[];
  circleCount: number;
  coins: { mint: string; symbol: string; name: string }[];
};

export type SocialFeed = {
  stories: StoryCard[];
  posts: PostCard[];
  videos: VideoCard[];
  circles: CircleCard[];
  people: PersonCard[];
};

export type ThreadCard = {
  with: PersonCard;
  lastBody: string;
  lastAt: number;
  messages: { id: string; fromId: string; body: string; at: number }[];
};

export type InboxView = { threads: ThreadCard[] };

export type AnalyticsView = {
  followers: number;
  following: number;
  posts: number;
  stories: number;
  videos: number;
  coins: number;
  trades: number;
  creatorFees: string;
  referrals: number;
};
