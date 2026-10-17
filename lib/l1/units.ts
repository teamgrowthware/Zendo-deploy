/**
 * ZCoin base-unit math. The Rust node, the application, and the genesis file all use eighteen
 * decimals, so one whole Z is always `1_000_000_000_000_000_000` base units. The node serializes
 * every amount as a decimal string, so this module is the only place that converts to and from Z.
 */
export const UNITS_PER_Z = 1_000_000_000_000_000_000n;
export const Z_DECIMALS = 18;

/** The permanent cap, in base units. It matches `GENESIS_SUPPLY_UNITS` in the node. */
export const SUPPLY_CAP_UNITS = 1_000_000_000n * UNITS_PER_Z;

/** Flat launchpad creation fee, in base units (0.2 Z). */
export const CREATE_FEE_UNITS = 200_000_000_000_000_000n;

/** First byte of a launchpad deploy payload. The node strips it before storing the program. */
export const LAUNCH_MARKER = 0xf0;

const DECIMAL = /^\d+(\.\d+)?$/;

/** Converts a whole, decimal, or BigInt Z amount into base units. */
export function zToUnits(value: number | string | bigint): bigint {
  if (typeof value === "bigint") return value * UNITS_PER_Z;
  const text = String(value).trim();
  if (!DECIMAL.test(text)) throw new Error(`"${text}" is not a positive Z amount`);
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > Z_DECIMALS) throw new Error(`Z amounts carry at most ${Z_DECIMALS} decimals`);
  const padded = (fraction + "0".repeat(Z_DECIMALS)).slice(0, Z_DECIMALS);
  return BigInt(whole) * UNITS_PER_Z + BigInt(padded || "0");
}

/** Renders base units as a plain decimal Z string, trimming trailing zeros. */
export function unitsToZ(units: bigint | string): string {
  const value = typeof units === "bigint" ? units : BigInt(units);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / UNITS_PER_Z;
  const fraction = (abs % UNITS_PER_Z).toString().padStart(Z_DECIMALS, "0").replace(/0+$/, "");
  const body = fraction ? `${whole}.${fraction}` : `${whole}`;
  return negative ? `-${body}` : body;
}

/** Formats base units with a fixed number of decimals for display. */
export function formatZ(units: bigint | string, decimals = 2): string {
  const value = typeof units === "bigint" ? units : BigInt(units);
  const padded = (value < 0n ? -value : value).toString().padStart(Z_DECIMALS + 1, "0");
  const whole = padded.slice(0, -Z_DECIMALS);
  const fraction = padded.slice(-Z_DECIMALS).slice(0, decimals);
  const body = decimals > 0 ? `${whole}.${fraction}` : whole;
  return value < 0n ? `-${body}` : body;
}

/** Parses a node decimal string into a BigInt, tolerating a raw integer too. */
export function parseUnits(value: bigint | string | number): bigint {
  if (typeof value === "bigint") return value;
  return BigInt(String(value).trim());
}
