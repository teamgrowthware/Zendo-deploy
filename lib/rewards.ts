export function pendingReward(
  amount: bigint,
  accrued: bigint,
  settledAt: number,
  now: number,
  aprBps: number,
): bigint {
  const elapsed = BigInt(Math.max(0, now - settledAt));
  const year = 365n * 24n * 60n * 60n * 1000n;
  const fresh = elapsed === 0n || amount <= 0n ? 0n : (amount * BigInt(aprBps) * elapsed) / (10_000n * year);
  return accrued + fresh;
}

export function splitReward(gross: bigint, commissionBps: number): { commission: bigint; net: bigint } {
  const commission = (gross * BigInt(commissionBps)) / 10_000n;
  return { commission, net: gross - commission };
}
