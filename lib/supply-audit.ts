import type { State } from "./state";
import { supplyUnits, TOTAL_SUPPLY_Z } from "./zendo-supply";

export const MAX_SUPPLY_Z = TOTAL_SUPPLY_Z;
export const MAX_SUPPLY_UNITS = supplyUnits(TOTAL_SUPPLY_Z);

export function totalZcoinUnits(state: State): bigint {
  let total = 0n;
  for (const account of Object.values(state.accounts)) {
    total += BigInt(account.balances.ZCOIN || "0");
  }
  for (const validator of state.validators) {
    total += BigInt(validator.selfStake || "0");
  }
  for (const stake of state.stakes) {
    total += BigInt(stake.amount || "0");
  }
  for (const row of state.unbonding) {
    total += BigInt(row.amount || "0");
  }
  return total;
}
