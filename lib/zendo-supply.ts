import table from "../founders.json";
import { parseUnits, Z_DECIMALS } from "./format";
import { founderTotalUnits } from "./zendo-founders";

export const TOTAL_SUPPLY_Z = table.totalSupply;
export const PUBLIC_ALLOCATION_Z = table.publicAllocation;

/** Liquid slices inside the public allocation. None of these are founder locks. */
export const PUBLIC_BUCKETS = {
  operator: "100000",
  studio: "20000",
  botEach: "100000",
  botCount: 6,
  treasury: "50000000",
  faucet: "0",
} as const;

export function supplyUnits(whole: string): bigint {
  return parseUnits(whole, Z_DECIMALS);
}

export function describePublic() {
  const operator = supplyUnits(PUBLIC_BUCKETS.operator);
  const studio = supplyUnits(PUBLIC_BUCKETS.studio);
  const botEach = supplyUnits(PUBLIC_BUCKETS.botEach);
  const bots = botEach * BigInt(PUBLIC_BUCKETS.botCount);
  const treasury = supplyUnits(PUBLIC_BUCKETS.treasury);
  const faucet = supplyUnits(PUBLIC_BUCKETS.faucet);
  const publicPool = supplyUnits(PUBLIC_ALLOCATION_Z) - operator - studio - bots - treasury - faucet;
  if (publicPool < 0n) throw new Error("Public buckets exceed the public allocation.");
  if (founderTotalUnits() + supplyUnits(PUBLIC_ALLOCATION_Z) !== supplyUnits(TOTAL_SUPPLY_Z)) {
    throw new Error("Founder locks plus the public allocation must equal 1,000,000,000 Z.");
  }
  return { operator, studio, botEach, bots, treasury, faucet, publicPool };
}

describePublic();
