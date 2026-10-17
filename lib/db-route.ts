import { placement, shardOf } from "./fleet";

/**
 * Writes go to the primary URL. Reads go to the replica URL when it differs.
 * Each shard process owns the accounts whose hash lands on its index.
 * ZENDO_SHARD_DATABASE_URLS is the per-shard primary list, used when this
 * process has no explicit ZENDO_DATABASE_URL.
 */
export function writeDatabaseUrl(): string {
  const explicit = (process.env.ZENDO_DATABASE_URL || "").trim();
  if (explicit) return explicit;
  const list = shardDatabaseUrls();
  if (!list.length) return "";
  return list[placement().index] || "";
}

export function readDatabaseUrl(): string {
  const replica = (process.env.ZENDO_DATABASE_REPLICA_URL || "").trim();
  return replica || writeDatabaseUrl();
}

export function shardDatabaseUrls(): string[] {
  return (process.env.ZENDO_SHARD_DATABASE_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function accountShard(id: string): number {
  return shardOf(id, Math.max(1, placement().count));
}

export function ownsAccount(id: string): boolean {
  const here = placement();
  if (here.count <= 1) return true;
  if (here.role === "gateway" || here.role === "replica") return true;
  return accountShard(id) === here.index;
}
