const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;

export function vestedAmount(
  total: bigint,
  genesisMs: number,
  now: number,
  cliffDays: number,
  years: number,
  yearlyUnlockBps: number,
): bigint {
  const elapsed = now - genesisMs;
  if (elapsed < cliffDays * DAY) return 0n;
  let unlockedYears = Math.floor(elapsed / YEAR);
  if (unlockedYears > years) unlockedYears = years;
  if (unlockedYears < 0) unlockedYears = 0;
  const bps = BigInt(unlockedYears * yearlyUnlockBps);
  const capped = bps > 10_000n ? 10_000n : bps;
  return (total * capped) / 10_000n;
}

export type VestingRow = {
  label: string;
  at: number;
  amount: bigint;
  unlocked: boolean;
};

export function vestingSchedule(
  total: bigint,
  genesisMs: number,
  now: number,
  cliffDays: number,
  years: number,
  yearlyUnlockBps: number,
): VestingRow[] {
  const rows: VestingRow[] = [
    {
      label: "Cliff",
      at: genesisMs + cliffDays * DAY,
      amount: 0n,
      unlocked: now >= genesisMs + cliffDays * DAY,
    },
  ];
  for (let year = 1; year <= years; year += 1) {
    const at = genesisMs + year * YEAR;
    rows.push({
      label: `Year ${year}`,
      at,
      amount: (total * BigInt(year * yearlyUnlockBps)) / 10_000n,
      unlocked: now >= at && now >= genesisMs + cliffDays * DAY,
    });
  }
  return rows;
}
