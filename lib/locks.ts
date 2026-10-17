import { cacheGet, cacheSet } from "./cache";

const PIN_LOCK_SECONDS = 5 * 60;

/** Shared across app instances when ZENDO_REDIS_URL is set. The ledger row remains the durable copy. */
export async function sharedPinLocked(userId: string): Promise<boolean> {
  const raw = await cacheGet(`pin-lock:${userId}`);
  if (!raw) return false;
  return Number(raw) > Date.now();
}

export async function sharePinFailure(userId: string, lockedUntil: number) {
  if (lockedUntil <= Date.now()) return;
  await cacheSet(`pin-lock:${userId}`, String(lockedUntil), PIN_LOCK_SECONDS);
}

export async function clearSharedPinLock(userId: string) {
  await cacheSet(`pin-lock:${userId}`, "0", 1);
}
