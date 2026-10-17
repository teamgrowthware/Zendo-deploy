import { TOKEN_UNIT } from "./format";

export type CurveSide = {
  z: bigint;
  tokens: bigint;
  k: bigint;
};

export type Quote = {
  tokens: bigint;
  netZ: bigint;
  grossZ: bigint;
  proceeds: bigint;
  fee: bigint;
  creatorFee: bigint;
  protocolFee: bigint;
  newZ: bigint;
  newTokens: bigint;
  priceBefore: bigint;
  priceAfter: bigint;
};

export function spotPrice(z: bigint, tokens: bigint): bigint {
  if (tokens <= 0n || z <= 0n) return 0n;
  return (z * TOKEN_UNIT) / tokens;
}

export function quoteBuy(side: CurveSide, gross: bigint, tradeBps: bigint, creatorBps: bigint): Quote {
  if (gross <= 0n) throw new Error("Enter an amount greater than zero.");
  if (creatorBps > tradeBps) throw new Error("Creator fee is larger than the trade fee.");
  if (side.z <= 0n || side.tokens <= 0n || side.k <= 0n) {
    throw new Error("This pool has no liquidity.");
  }
  const creatorFee = (gross * creatorBps) / 10_000n;
  const protocolFee = (gross * (tradeBps - creatorBps)) / 10_000n;
  const fee = creatorFee + protocolFee;
  const netZ = gross - fee;
  if (netZ <= 0n) throw new Error("That amount is smaller than the fee.");
  const priceBefore = spotPrice(side.z, side.tokens);
  const newZ = side.z + netZ;
  const newTokens = side.k / newZ;
  if (newTokens <= 0n || newTokens >= side.tokens) {
    throw new Error("That buy is too small to clear the curve.");
  }
  return {
    tokens: side.tokens - newTokens,
    netZ,
    grossZ: gross,
    proceeds: 0n,
    fee,
    creatorFee,
    protocolFee,
    newZ,
    newTokens,
    priceBefore,
    priceAfter: spotPrice(newZ, newTokens),
  };
}

export function quoteSell(side: CurveSide, tokensIn: bigint, tradeBps: bigint, creatorBps: bigint): Quote {
  if (tokensIn <= 0n) throw new Error("Enter an amount greater than zero.");
  if (side.z <= 0n || side.tokens <= 0n || side.k <= 0n) {
    throw new Error("This pool has no liquidity.");
  }
  const priceBefore = spotPrice(side.z, side.tokens);
  const newTokens = side.tokens + tokensIn;
  const newZ = side.k / newTokens;
  if (newZ <= 0n || newZ >= side.z) throw new Error("The pool cannot pay out that sale.");
  const grossOut = side.z - newZ;
  const creatorFee = (grossOut * creatorBps) / 10_000n;
  const protocolFee = (grossOut * (tradeBps - creatorBps)) / 10_000n;
  const fee = creatorFee + protocolFee;
  const proceeds = grossOut - fee;
  if (proceeds <= 0n) throw new Error("That sale is smaller than the fee.");
  return {
    tokens: tokensIn,
    netZ: grossOut,
    grossZ: grossOut,
    proceeds,
    fee,
    creatorFee,
    protocolFee,
    newZ,
    newTokens,
    priceBefore,
    priceAfter: spotPrice(newZ, newTokens),
  };
}

export function capBuy(
  side: CurveSide,
  gross: bigint,
  remaining: bigint,
  tradeBps: bigint,
  creatorBps: bigint,
): { quote: Quote; capped: boolean } {
  if (remaining <= 0n) throw new Error("The curve has no tokens left.");
  let probe: Quote;
  try {
    probe = quoteBuy(side, gross, tradeBps, creatorBps);
  } catch (error) {
    throw error;
  }
  if (probe.tokens <= remaining) return { quote: probe, capped: false };
  let lo = 1n;
  let hi = gross;
  let best: Quote | null = null;
  for (let i = 0; i < 80 && lo <= hi; i += 1) {
    const mid = (lo + hi) / 2n;
    try {
      const quote = quoteBuy(side, mid, tradeBps, creatorBps);
      if (quote.tokens <= remaining && quote.tokens > 0n) {
        best = quote;
        lo = mid + 1n;
      } else {
        hi = mid - 1n;
      }
    } catch {
      hi = mid - 1n;
    }
  }
  if (!best) throw new Error("Amount is too small to buy from this curve.");
  return { quote: best, capped: true };
}

export function marketCap(price: bigint, totalSupply: bigint): bigint {
  return price * (totalSupply / TOKEN_UNIT);
}

export function impactPct(before: bigint, after: bigint): number {
  if (before <= 0n) return 0;
  return Number(((after - before) * 10_000n) / before) / 100;
}
