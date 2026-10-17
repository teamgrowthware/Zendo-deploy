import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Planning budgets for one process. They are not a benchmark of a billion
 * transactions per second. Add gateway processes for open connections and
 * shard processes for transfers. Capacity is the sum of the machines you run.
 */
export const CONNECTIONS_PER_GATEWAY = 20_000;
export const TRANSFERS_PER_SHARD = 100;
export const OUTBOX_CAP = 100_000;

export type ShardReceipt = {
  id: string;
  fromShard: number;
  toShard: number;
  to: string;
  asset: string;
  amount: string;
  mac: string;
  delivered: boolean;
};

export function shardOf(address: string, count: number): number {
  if (count <= 1) return 0;
  const digest = createHash("sha256").update(address).digest();
  return digest.readUInt32BE(0) % count;
}

export function placement() {
  const count = positiveInt(process.env.ZENDO_SHARD_COUNT, 1);
  const fromPod = /(\d+)$/.exec(process.env.POD_NAME || "");
  const index = process.env.ZENDO_SHARD_INDEX
    ? positiveInt(process.env.ZENDO_SHARD_INDEX, 0)
    : fromPod
      ? Number(fromPod[1])
      : 0;
  const named = process.env.ZENDO_ROLE;
  const role = named === "gateway" || named === "replica" || named === "primary" ? named : "shard";
  const urls = (process.env.ZENDO_SHARD_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    role,
    count,
    index,
    follower: role === "shard" && count > 1 && index > 0,
    urls,
    secret: process.env.ZENDO_SHARD_SECRET || "",
    primaryUrl: (process.env.ZENDO_PRIMARY_URL || "").trim(),
    fleetSecret: process.env.ZENDO_FLEET_SECRET || "",
  };
}

export function machinesFor(users: number, tps: number) {
  const people = Number.isFinite(users) && users > 0 ? users : 0;
  const rate = Number.isFinite(tps) && tps > 0 ? tps : 0;
  const gateways = Math.max(1, Math.ceil(people / CONNECTIONS_PER_GATEWAY));
  const shards = Math.max(1, Math.ceil(rate / TRANSFERS_PER_SHARD));
  return {
    users: people,
    tps: rate,
    gateways,
    shards,
    connectionsPerGateway: CONNECTIONS_PER_GATEWAY,
    transfersPerShard: TRANSFERS_PER_SHARD,
  };
}

export function signReceipt(receipt: Omit<ShardReceipt, "mac" | "delivered">, secret: string): ShardReceipt {
  if (!secret) throw new Error("Set ZENDO_SHARD_SECRET before coins can move between shards.");
  const body = canonical(receipt);
  return { ...receipt, delivered: false, mac: createHmac("sha256", secret).update(body).digest("hex") };
}

export function receiptMacValid(receipt: ShardReceipt, secret: string): boolean {
  if (!secret || !/^[0-9a-f]{64}$/.test(receipt.mac)) return false;
  const expected = createHmac("sha256", secret).update(canonical(receipt)).digest();
  const got = Buffer.from(receipt.mac, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

function canonical(receipt: Omit<ShardReceipt, "mac" | "delivered">): string {
  return [receipt.id, receipt.fromShard, receipt.toShard, receipt.to, receipt.asset, receipt.amount].join("|");
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}
