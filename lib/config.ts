import { readFileSync, existsSync } from "fs";
import { parse } from "smol-toml";
import type { ChainParams } from "./params";
import { configPath } from "./paths";

export type ValidatorSeed = {
  moniker: string;
  commissionBps: number;
  status: "active" | "pending" | "jailed";
  region: string;
  uptimeBps: number;
};

export type ZendoConfig = {
  networkId: string;
  chainName: string;
  pohEnabled: boolean;
  blockTimeMs: number;
  finalityDepth: number;
  genesisTime: number;
  supply: string;
  founderBps: number;
  faucetBps: number;
  validatorBps: number;
  treasuryBps: number;
  airdrop: string;
  cliffDays: number;
  vestingYears: number;
  yearlyUnlockBps: number;
  aprBps: number;
  minDelegate: string;
  unbondingBlocks: number;
  gas: {
    transfer: string;
    createCoin: string;
    trade: string;
    vote: string;
    proposal: string;
    promote: string;
    stake: string;
  };
  tradeBps: number;
  creatorBps: number;
  virtualZ: string;
  graduationZ: string;
  memeDecimals: number;
  saleTokens: string;
  totalTokens: string;
  virtualTokens: string;
  features: {
    mev: boolean;
    premiumRpc: boolean;
    governance: boolean;
    launchpad: boolean;
  };
  validators: ValidatorSeed[];
};

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function section(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = raw[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const DEFAULT_VALIDATORS: ValidatorSeed[] = [
  { moniker: "North Arch", commissionBps: 400, status: "active", region: "ashburn", uptimeBps: 9990 },
  { moniker: "Harbor Relay", commissionBps: 500, status: "active", region: "frankfurt", uptimeBps: 9980 },
];

function validatorsOf(raw: Record<string, unknown>): ValidatorSeed[] {
  const rows = Array.isArray(raw.validators) ? raw.validators : [];
  const parsed = rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const status = str(item.status, "active");
    const safeStatus = status === "pending" || status === "jailed" || status === "active" ? status : "active";
    const moniker = str(item.moniker, "");
    if (!moniker) return [];
    return [
      {
        moniker,
        commissionBps: num(item.commission_bps, 500),
        status: safeStatus,
        region: str(item.region, "local"),
        uptimeBps: num(item.uptime_bps, 9900),
      } satisfies ValidatorSeed,
    ];
  });
  return parsed.length ? parsed : DEFAULT_VALIDATORS;
}

export function loadConfig(): ZendoConfig {
  const file = configPath();
  const raw = existsSync(file) ? (parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
  const distribution = section(raw, "distribution");
  const vesting = section(raw, "vesting");
  const staking = section(raw, "staking");
  const gas = section(raw, "gas");
  const fees = section(raw, "fees");
  const launchpad = section(raw, "launchpad");
  const features = section(raw, "features");
  const genesis = Date.parse(str(raw.genesis_time, "2025-06-01T00:00:00Z"));
  return {
    networkId: str(raw.network_id, "zendo-1"),
    chainName: str(raw.chain_name, "Zendo"),
    pohEnabled: bool(raw.poh_enabled, true),
    blockTimeMs: Math.max(1000, num(raw.block_time_ms, 5000)),
    finalityDepth: Math.max(1, num(raw.finality_depth, 2)),
    genesisTime: Number.isFinite(genesis) ? genesis : Date.parse("2025-06-01T00:00:00Z"),
    supply: str(distribution.zcoin_supply, "1000000000"),
    founderBps: num(distribution.founder_bps, 0),
    faucetBps: num(distribution.faucet_bps, 0),
    validatorBps: num(distribution.validator_bps, 0),
    treasuryBps: num(distribution.treasury_bps, 0),
    airdrop: str(distribution.airdrop, "0"),
    cliffDays: num(vesting.cliff_days, 120),
    vestingYears: num(vesting.years, 4),
    yearlyUnlockBps: num(vesting.yearly_unlock_bps, 2500),
    aprBps: num(staking.apr_bps, 800),
    minDelegate: str(staking.min_delegate, "1"),
    unbondingBlocks: Math.max(1, num(staking.unbonding_blocks, 2)),
    gas: {
      transfer: str(gas.transfer, "0.001"),
      createCoin: str(gas.create_coin, "0.2"),
      trade: str(gas.trade, "0.0005"),
      vote: str(gas.vote, "0.002"),
      proposal: str(gas.proposal, "1"),
      promote: str(gas.promote, "50"),
      stake: str(gas.stake, "0.001"),
    },
    tradeBps: num(fees.trade_bps, 100),
    creatorBps: num(fees.creator_bps, 30),
    virtualZ: str(launchpad.virtual_z, "30"),
    graduationZ: str(launchpad.graduation_z, "85"),
    memeDecimals: num(launchpad.meme_decimals, 6),
    saleTokens: str(launchpad.sale_tokens, "800000000"),
    totalTokens: str(launchpad.total_tokens, "1000000000"),
    virtualTokens: str(launchpad.virtual_tokens, "1073000000"),
    features: {
      mev: bool(features.mev, false),
      premiumRpc: bool(features.premium_rpc, true),
      governance: bool(features.governance, true),
      launchpad: bool(features.launchpad, true),
    },
    validators: validatorsOf(raw),
  };
}

let cached: ZendoConfig | null = null;
let bound: ChainParams = {};

export function bindChainParams(params: ChainParams | undefined) {
  bound = params ?? {};
}

function overlay(base: ZendoConfig, params: ChainParams): ZendoConfig {
  if (!Object.keys(params).length) return base;
  const gas = { ...base.gas };
  if (params.gasTransfer !== undefined) gas.transfer = params.gasTransfer;
  if (params.gasTrade !== undefined) gas.trade = params.gasTrade;
  if (params.gasVote !== undefined) gas.vote = params.gasVote;
  if (params.gasStake !== undefined) gas.stake = params.gasStake;
  if (params.gasProposal !== undefined) gas.proposal = params.gasProposal;
  if (params.gasCreateCoin !== undefined) gas.createCoin = params.gasCreateCoin;
  if (params.gasPromote !== undefined) gas.promote = params.gasPromote;
  return {
    ...base,
    blockTimeMs: params.blockTimeMs ?? base.blockTimeMs,
    finalityDepth: params.finalityDepth ?? base.finalityDepth,
    aprBps: params.aprBps ?? base.aprBps,
    minDelegate: params.minDelegate ?? base.minDelegate,
    unbondingBlocks: params.unbondingBlocks ?? base.unbondingBlocks,
    tradeBps: params.tradeBps ?? base.tradeBps,
    creatorBps: params.creatorBps ?? base.creatorBps,
    graduationZ: params.graduationZ ?? base.graduationZ,
    gas,
    features: { ...base.features, mev: params.mev ?? base.features.mev },
  };
}

export function getConfig(): ZendoConfig {
  if (!cached) cached = loadConfig();
  return overlay(cached, bound);
}
