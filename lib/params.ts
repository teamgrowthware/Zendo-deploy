export const PARAMS = [
  { key: "block_time_ms", label: "Block time (ms)", hint: "1000 to 30000" },
  { key: "finality_depth", label: "Finality depth (blocks)", hint: "1 to 32" },
  { key: "trade_bps", label: "Trade fee (basis points)", hint: "0 to 1000" },
  { key: "creator_bps", label: "Creator share of a trade (basis points)", hint: "0 to the trade fee" },
  { key: "apr_bps", label: "Staking APR (basis points)", hint: "0 to 3000" },
  { key: "graduation_z", label: "Graduation reserves (ZCoin)", hint: "1 to 1000000" },
  { key: "min_delegate", label: "Minimum stake (ZCoin)", hint: "greater than 0" },
  { key: "unbonding_blocks", label: "Unbonding (blocks)", hint: "1 to 500" },
  { key: "mev", label: "MEV skim", hint: "on or off" },
  { key: "gas_transfer", label: "Transfer fee (ZCoin)", hint: "0 to 10" },
  { key: "gas_trade", label: "Trade gas (ZCoin)", hint: "0 to 10" },
  { key: "gas_vote", label: "Vote fee (ZCoin)", hint: "0 to 10" },
  { key: "gas_stake", label: "Stake fee (ZCoin)", hint: "0 to 10" },
  { key: "gas_proposal", label: "Proposal fee (ZCoin)", hint: "0 to 1000" },
  { key: "gas_create_coin", label: "Coin creation fee (ZCoin)", hint: "0 to 1000" },
  { key: "gas_promote", label: "Promotion fee (ZCoin)", hint: "0 to 100000" },
] as const;

export type ParamKey = (typeof PARAMS)[number]["key"];

export type ChainParams = {
  blockTimeMs?: number;
  finalityDepth?: number;
  tradeBps?: number;
  creatorBps?: number;
  aprBps?: number;
  graduationZ?: string;
  minDelegate?: string;
  unbondingBlocks?: number;
  mev?: boolean;
  gasTransfer?: string;
  gasTrade?: string;
  gasVote?: string;
  gasStake?: string;
  gasProposal?: string;
  gasCreateCoin?: string;
  gasPromote?: string;
};

export type LiveFees = { tradeBps: number; creatorBps: number };

function intIn(raw: string, min: number, max: number, label: string): number {
  if (!/^\d+$/.test(raw.trim())) throw new Error(`${label} must be a whole number.`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be from ${min} to ${max}.`);
  return value;
}

function zIn(raw: string, maxWhole: number, label: string): string {
  const text = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`${label} must be a ZCoin amount.`);
  const whole = Number(text);
  if (!Number.isFinite(whole) || whole < 0 || whole > maxWhole) throw new Error(`${label} must be from 0 to ${maxWhole}.`);
  return text;
}

export function parseParam(key: string, value: unknown, fees: LiveFees): { patch: ChainParams; label: string } {
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!raw) throw new Error("Enter a value for the parameter.");
  const known = PARAMS.find((item) => item.key === key);
  if (!known) throw new Error("That parameter cannot be changed by a vote.");
  switch (known.key) {
    case "block_time_ms":
      return { patch: { blockTimeMs: intIn(raw, 1000, 30000, known.label) }, label: `${known.label} = ${raw}` };
    case "finality_depth":
      return { patch: { finalityDepth: intIn(raw, 1, 32, known.label) }, label: `${known.label} = ${raw}` };
    case "trade_bps": {
      const tradeBps = intIn(raw, 0, 1000, known.label);
      if (tradeBps < fees.creatorBps) throw new Error("The trade fee cannot fall below the creator share.");
      return { patch: { tradeBps }, label: `${known.label} = ${raw}` };
    }
    case "creator_bps": {
      const creatorBps = intIn(raw, 0, 1000, known.label);
      if (creatorBps > fees.tradeBps) throw new Error("The creator share cannot exceed the trade fee.");
      return { patch: { creatorBps }, label: `${known.label} = ${raw}` };
    }
    case "apr_bps":
      return { patch: { aprBps: intIn(raw, 0, 3000, known.label) }, label: `${known.label} = ${raw}` };
    case "graduation_z":
      return { patch: { graduationZ: zIn(raw, 1_000_000, known.label) }, label: `${known.label} = ${raw}` };
    case "min_delegate": {
      const minDelegate = zIn(raw, 1_000_000, known.label);
      if (Number(minDelegate) <= 0) throw new Error("Minimum stake must be greater than 0.");
      return { patch: { minDelegate }, label: `${known.label} = ${raw}` };
    }
    case "unbonding_blocks":
      return { patch: { unbondingBlocks: intIn(raw, 1, 500, known.label) }, label: `${known.label} = ${raw}` };
    case "mev": {
      const on = raw === "on" || raw === "true" || raw === "1";
      const off = raw === "off" || raw === "false" || raw === "0";
      if (!on && !off) throw new Error("MEV skim must be on or off.");
      return { patch: { mev: on }, label: `${known.label} = ${on ? "on" : "off"}` };
    }
    case "gas_transfer":
      return { patch: { gasTransfer: zIn(raw, 10, known.label) }, label: `${known.label} = ${raw}` };
    case "gas_trade":
      return { patch: { gasTrade: zIn(raw, 10, known.label) }, label: `${known.label} = ${raw}` };
    case "gas_vote":
      return { patch: { gasVote: zIn(raw, 10, known.label) }, label: `${known.label} = ${raw}` };
    case "gas_stake":
      return { patch: { gasStake: zIn(raw, 10, known.label) }, label: `${known.label} = ${raw}` };
    case "gas_proposal":
      return { patch: { gasProposal: zIn(raw, 1000, known.label) }, label: `${known.label} = ${raw}` };
    case "gas_create_coin":
      return { patch: { gasCreateCoin: zIn(raw, 1000, known.label) }, label: `${known.label} = ${raw}` };
    case "gas_promote":
      return { patch: { gasPromote: zIn(raw, 100_000, known.label) }, label: `${known.label} = ${raw}` };
    default:
      throw new Error("That parameter cannot be changed by a vote.");
  }
}
