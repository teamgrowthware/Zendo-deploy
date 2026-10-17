import table from "../founders.json";
import { parseUnits, Z_DECIMALS } from "./format";
import { addressFromLabel } from "./ids";

export type FounderAllocation = {
  id: string;
  name: string;
  role: string;
  amount: string;
  polygon: string;
};

/** Locked ZendoCoin. Amounts come from founders.json, the same table the Polygon script reads. */
export const ZENDO_FOUNDERS: FounderAllocation[] = table.founders.map((row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  amount: row.amount,
  polygon: row.polygon,
}));

export function founderUnits(amount: string): bigint {
  return parseUnits(amount, Z_DECIMALS);
}

export function founderTotalUnits(): bigint {
  return ZENDO_FOUNDERS.reduce((sum, founder) => sum + founderUnits(founder.amount), 0n);
}

export function founderVestingAddress(id: string): string {
  return addressFromLabel(`founder-vesting:${id}`);
}

export function founderWalletAddress(id: string): string {
  return addressFromLabel(`founder-wallet:${id}`);
}
