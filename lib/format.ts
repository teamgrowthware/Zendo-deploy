export const Z_DECIMALS = 18;
export const TOKEN_DECIMALS = 6;
export const Z_UNIT = 10n ** BigInt(Z_DECIMALS);
export const TOKEN_UNIT = 10n ** BigInt(TOKEN_DECIMALS);

export function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a positive amount using digits only.");
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (whole.length > 24) throw new Error("That amount is too large.");
  if (frac.length > decimals) {
    throw new Error(`Use at most ${decimals} decimal places.`);
  }
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function formatUnits(value: bigint, decimals: number, maxFrac = 4): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFrac)
    .replace(/0+$/, "");
  const body = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  return neg ? `-${body}` : body;
}

export function groupAmount(value: string): string {
  const neg = value.startsWith("-");
  const raw = neg ? value.slice(1) : value;
  const [whole, frac] = raw.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = frac ? `${grouped}.${frac}` : grouped;
  return neg ? `-${out}` : out;
}

export function formatZ(value: bigint, maxFrac = 4): string {
  return groupAmount(formatUnits(value, Z_DECIMALS, maxFrac));
}

export function formatToken(value: bigint, maxFrac = 2): string {
  return groupAmount(formatUnits(value, TOKEN_DECIMALS, maxFrac));
}

export function formatPrice(zPerToken: bigint): string {
  const raw = formatUnits(zPerToken, Z_DECIMALS, 12).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return raw === "" ? "0" : raw;
}

export function compactUnits(value: bigint, decimals: number): string {
  const numeric = Number(formatUnits(value, decimals, 6));
  const abs = Math.abs(numeric);
  if (!Number.isFinite(numeric)) return "0";
  if (abs >= 1_000_000_000) return `${trimNum(numeric / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${trimNum(numeric / 1_000_000)}M`;
  if (abs >= 10_000) return `${trimNum(numeric / 1_000)}K`;
  return groupAmount(formatUnits(value, decimals, abs >= 100 ? 2 : 4));
}

function trimNum(value: number): string {
  return value.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "0.0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function shortAddr(address: string): string {
  if (address.length < 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

export function shortHash(hash: string): string {
  if (hash.length < 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function priceNumber(zReserve: bigint, tokenReserve: bigint): number {
  if (tokenReserve <= 0n || zReserve <= 0n) return 0;
  const scale = 1_000_000_000_000n;
  const scaled = (zReserve * TOKEN_UNIT * scale) / tokenReserve / Z_UNIT;
  return Number(scaled) / 1e12;
}

export function bpsOf(value: bigint, bps: bigint): bigint {
  return (value * bps) / 10_000n;
}
