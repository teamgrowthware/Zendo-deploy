/** Activity index for ZendoCoin. 1_000_000 means 1.000000. Not a dollar price. */
export const ZCOIN_INDEX_SCALE = 1_000_000n;

export function bumpZcoinIndex(index: bigint, side: "buy" | "sell", netZ: bigint): bigint {
  if (index <= 0n) index = ZCOIN_INDEX_SCALE;
  const whole = netZ / 10n ** 18n;
  if (whole <= 0n) return index;
  const bps = whole > 200n ? 200n : whole;
  if (side === "buy") return index + (index * bps) / 10_000n;
  const next = index - (index * bps) / 10_000n;
  return next < 1n ? 1n : next;
}

export function formatIndex(index: bigint): string {
  const whole = index / ZCOIN_INDEX_SCALE;
  const frac = (index % ZCOIN_INDEX_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

/** Operator-supplied reference. Absent unless ZENDO_USD_PER_Z is set. Not an exchange price. */
export function usdPerZ(): number | null {
  const raw = process.env.ZENDO_USD_PER_Z?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}
