import { createHash } from "crypto";

type MemoryRow = { value: string; expires: number };

const memory = new Map<string, MemoryRow>();
type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, ttl: number): Promise<number>;
  xadd(key: string, ...args: string[]): Promise<string>;
};

let client: RedisClient | null = null;
let clientUrl = "";
let failed = false;

function redisUrl() {
  return (process.env.ZENDO_REDIS_URL || process.env.REDIS_URL || "").trim();
}

async function redis() {
  const url = redisUrl();
  if (!url || failed) return null;
  if (client && clientUrl === url) return client;
  try {
    const { default: Redis } = await import("ioredis");
    const next = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 1500, lazyConnect: true });
    await next.connect();
    client = next as unknown as RedisClient;
    clientUrl = url;
    return client;
  } catch {
    failed = true;
    client = null;
    return null;
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) memory.delete(key);
  const remote = await redis();
  if (!remote) return null;
  try {
    return await remote.get(cacheKey(key));
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds = 2) {
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  const remote = await redis();
  if (!remote) return;
  try {
    await remote.set(cacheKey(key), value, "EX", ttlSeconds);
  } catch {
    /* the memory row still serves this process */
  }
}

export async function cacheIncr(key: string, ttlSeconds: number): Promise<number | null> {
  const remote = await redis();
  if (!remote) return null;
  try {
    const full = cacheKey(key);
    const count = await remote.incr(full);
    if (count === 1) await remote.expire(full, ttlSeconds);
    return count;
  } catch {
    return null;
  }
}

export async function cacheStreamAdd(stream: string, fields: Record<string, string>): Promise<string | null> {
  const remote = await redis();
  if (!remote) return null;
  const args = ["MAXLEN", "~", "100000", "*"];
  for (const [key, value] of Object.entries(fields)) args.push(key, value);
  try {
    return await remote.xadd(stream, ...args);
  } catch {
    return null;
  }
}

function cacheKey(key: string) {
  return `zendo:${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}
