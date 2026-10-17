import pg from "pg";
import { readDatabaseUrl, writeDatabaseUrl } from "./db-route";
import { journalRows } from "./double-entry";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS balances (
  address TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount TEXT NOT NULL,
  PRIMARY KEY (address, asset)
);
CREATE TABLE IF NOT EXISTS replay_guards (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  seen_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  at BIGINT NOT NULL,
  debit TEXT NOT NULL,
  credit TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS balances_address_idx ON balances (address);
CREATE INDEX IF NOT EXISTS transfers_debit_idx ON transfers (debit);
CREATE INDEX IF NOT EXISTS transfers_credit_idx ON transfers (credit);
CREATE INDEX IF NOT EXISTS transfers_asset_at_idx ON transfers (asset, at);
CREATE INDEX IF NOT EXISTS replay_guards_seen_idx ON replay_guards (seen_at);
CREATE TABLE IF NOT EXISTS chain_blocks (
  height BIGINT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS chain_txs (
  hash TEXT PRIMARY KEY,
  height BIGINT NOT NULL,
  at BIGINT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  asset TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chain_txs_height_idx ON chain_txs (height);
CREATE INDEX IF NOT EXISTS chain_txs_from_idx ON chain_txs (from_address);
CREATE INDEX IF NOT EXISTS chain_txs_to_idx ON chain_txs (to_address);
CREATE TABLE IF NOT EXISTS chain_coins (
  mint TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS chain_coins_symbol_idx ON chain_coins (symbol);
CREATE INDEX IF NOT EXISTS chain_coins_created_idx ON chain_coins (created_at);
CREATE TABLE IF NOT EXISTS chain_stakes (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  validator_id TEXT NOT NULL,
  amount TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chain_stakes_address_idx ON chain_stakes (address);
CREATE INDEX IF NOT EXISTS chain_stakes_validator_idx ON chain_stakes (validator_id);
CREATE TABLE IF NOT EXISTS chain_proposals (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  author TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chain_proposals_status_idx ON chain_proposals (status);
CREATE INDEX IF NOT EXISTS chain_proposals_author_idx ON chain_proposals (author);
`;

type AccountBalances = { balances?: Record<string, string> };

let pool: pg.Pool | null = null;
let poolUrl = "";
let readPool: pg.Pool | null = null;
let readPoolUrl = "";
let schemaReady: Promise<void> | null = null;
let cachedBytes = 0;

export function databaseUrl(): string {
  return writeDatabaseUrl();
}

export function usingPostgres(): boolean {
  return Boolean(databaseUrl());
}

export function replicaUrl(): string {
  return readDatabaseUrl();
}

export function ledgerIndexes(): string[] {
  return [
    "balances_address_idx",
    "transfers_debit_idx",
    "transfers_credit_idx",
    "transfers_asset_at_idx",
    "replay_guards_seen_idx",
    "chain_txs_height_idx",
    "chain_txs_from_idx",
    "chain_txs_to_idx",
    "chain_coins_symbol_idx",
    "chain_coins_created_idx",
    "chain_stakes_address_idx",
    "chain_stakes_validator_idx",
    "chain_proposals_status_idx",
    "chain_proposals_author_idx",
  ].filter((name) => SCHEMA.includes(name));
}

export function pgPoolMax(): number {
  const raw = Number(process.env.ZENDO_PG_POOL_MAX || 20);
  if (!Number.isFinite(raw) || raw < 1) return 20;
  return Math.min(100, Math.floor(raw));
}

function poolOptions(url: string): pg.Pool {
  const max = pgPoolMax();
  const idle = Number(process.env.ZENDO_PG_IDLE_MS || 10000);
  const connect = Number(process.env.ZENDO_PG_CONNECT_MS || 5000);
  const statement = Number(process.env.ZENDO_PG_STATEMENT_MS || 8000);
  const timeout = Number.isFinite(statement) && statement >= 1000 ? Math.floor(statement) : 8000;
  return new pg.Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: Number.isFinite(idle) && idle >= 1000 ? idle : 10000,
    connectionTimeoutMillis: Number.isFinite(connect) && connect >= 500 ? connect : 5000,
    application_name: "zendo",
    options: `-c statement_timeout=${timeout}`,
  });
}

function getWritePool(): pg.Pool {
  const url = databaseUrl();
  if (!url) throw new Error("Set ZENDO_DATABASE_URL to a PostgreSQL connection string.");
  if (pool && poolUrl === url) return pool;
  if (pool) void pool.end().catch(() => undefined);
  pool = poolOptions(url);
  poolUrl = url;
  schemaReady = null;
  return pool;
}

function getReadPool(): pg.Pool {
  const url = replicaUrl();
  if (!url || url === databaseUrl()) return getWritePool();
  if (readPool && readPoolUrl === url) return readPool;
  if (readPool) void readPool.end().catch(() => undefined);
  readPool = poolOptions(url);
  readPoolUrl = url;
  return readPool;
}

async function readyWrite(): Promise<pg.Pool> {
  const current = getWritePool();
  if (!schemaReady) {
    schemaReady = current.query(SCHEMA).then(() => undefined);
  }
  await schemaReady;
  return current;
}

async function readyRead(): Promise<pg.Pool> {
  if (!replicaUrl() || replicaUrl() === databaseUrl()) return readyWrite();
  return getReadPool();
}

export async function resetPostgres() {
  const current = await readyWrite();
  await current.query("TRUNCATE documents, balances, replay_guards, transfers");
}

export async function closePostgres() {
  schemaReady = null;
  const pools = new Set<pg.Pool>();
  if (pool) pools.add(pool);
  if (readPool) pools.add(readPool);
  pool = null;
  readPool = null;
  poolUrl = "";
  readPoolUrl = "";
  await Promise.all([...pools].map((current) => current.end().catch(() => undefined)));
}

export async function countTransfersPg(): Promise<number> {
  const current = await readyWrite();
  const row = await current.query("SELECT COUNT(*)::int AS n FROM transfers");
  return Number(row.rows[0]?.n || 0);
}

export async function persistLedgerPg(body: string, accounts: Record<string, AccountBalances>, replay: string[]) {
  const current = await readyWrite();
  const client = await current.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query("SELECT revision FROM documents WHERE id = 'chain'");
    const revision = Number(row.rows[0]?.revision || 0) + 1;
    await client.query(
      `INSERT INTO documents (id, revision, body) VALUES ('chain', $1, $2)
       ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, body = excluded.body`,
      [revision, body],
    );
    await client.query("DELETE FROM balances");
    for (const [address, account] of Object.entries(accounts)) {
      for (const [asset, amount] of Object.entries(account.balances || {})) {
        if (!amount || amount === "0") continue;
        await client.query("INSERT INTO balances (address, asset, amount) VALUES ($1, $2, $3)", [address, asset, amount]);
      }
    }
    const now = Date.now();
    for (const key of replay) {
      await client.query(
        "INSERT INTO replay_guards (key, kind, detail, seen_at) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING",
        [key, key.startsWith("release:") ? "release" : "lock", key, now],
      );
    }
    await client.query("DELETE FROM transfers");
    const journal = journalRows(body);
    if (journal.length) {
      await client.query(
        `INSERT INTO transfers (id, at, debit, credit, asset, amount)
         SELECT * FROM unnest($1::text[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[])`,
        [
          journal.map((entry) => entry.id),
          journal.map((entry) => entry.at),
          journal.map((entry) => entry.debit),
          journal.map((entry) => entry.credit),
          journal.map((entry) => entry.asset),
          journal.map((entry) => entry.amount),
        ],
      );
    }
    await writeChainIndex(client, body);
    await client.query("COMMIT");
    const size = await client.query("SELECT pg_database_size(current_database()) AS bytes");
    cachedBytes = Number(size.rows[0]?.bytes || 0);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* rollback already finished */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function loadLedgerPg(): Promise<{ body: string; replay: string[] } | null> {
  const current = await readyRead();
  const row = await current.query("SELECT body FROM documents WHERE id = 'chain'");
  const body = row.rows[0]?.body;
  if (typeof body !== "string" || !body) return null;
  const guards = await current.query("SELECT key FROM replay_guards");
  return {
    body,
    replay: guards.rows.map((item: { key?: string }) => String(item.key || "")).filter(Boolean),
  };
}

export async function readBalancePg(address: string, asset = "ZCOIN"): Promise<string> {
  const current = await readyRead();
  const row = await current.query("SELECT amount FROM balances WHERE address = $1 AND asset = $2", [address, asset]);
  return String(row.rows[0]?.amount || "0");
}

/** Row lock so overlapping app servers cannot drop a credit. */
export async function addBalancePg(address: string, asset: string, delta: bigint): Promise<string> {
  if (delta === 0n) return readBalancePg(address, asset);
  const current = await readyWrite();
  const client = await current.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query("SELECT amount FROM balances WHERE address = $1 AND asset = $2 FOR UPDATE", [address, asset]);
    const next = BigInt(row.rows[0]?.amount || "0") + delta;
    if (next < 0n) throw new Error("Balance cannot go below zero.");
    await client.query(
      `INSERT INTO balances (address, asset, amount) VALUES ($1, $2, $3)
       ON CONFLICT (address, asset) DO UPDATE SET amount = excluded.amount`,
      [address, asset, next.toString()],
    );
    await client.query("COMMIT");
    return next.toString();
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* rollback already finished */
    }
    throw error;
  } finally {
    client.release();
  }
}

async function writeChainIndex(client: pg.PoolClient, body: string) {
  let parsed: { blocks?: unknown; txs?: unknown; coins?: unknown; stakes?: unknown; proposals?: unknown } = {};
  try {
    parsed = JSON.parse(body) as { blocks?: unknown; txs?: unknown; coins?: unknown; stakes?: unknown; proposals?: unknown };
  } catch {
    parsed = {};
  }
  const blocks = (Array.isArray(parsed.blocks) ? parsed.blocks : []).slice(-500) as { height?: number; hash?: string; at?: number }[];
  const txs = (Array.isArray(parsed.txs) ? parsed.txs : []).slice(-2000) as { hash?: string; height?: number | null; at?: number; from?: string; to?: string; token?: string }[];
  const coins = (Array.isArray(parsed.coins) ? parsed.coins : []) as { mint?: string; symbol?: string; createdAt?: number }[];
  const stakes = (Array.isArray(parsed.stakes) ? parsed.stakes : []) as { id?: string; address?: string; validatorId?: string; amount?: string }[];
  const proposals = (Array.isArray(parsed.proposals) ? parsed.proposals : []) as { id?: string; status?: string; author?: string }[];
  await client.query("DELETE FROM chain_blocks");
  await client.query("DELETE FROM chain_txs");
  await client.query("DELETE FROM chain_coins");
  await client.query("DELETE FROM chain_stakes");
  await client.query("DELETE FROM chain_proposals");
  const blockRows = blocks.filter((row) => Number.isInteger(row.height) && row.hash);
  if (blockRows.length) {
    await client.query(
      `INSERT INTO chain_blocks (height, hash, at)
       SELECT * FROM unnest($1::bigint[], $2::text[], $3::bigint[])`,
      [blockRows.map((row) => row.height), blockRows.map((row) => row.hash), blockRows.map((row) => row.at || 0)],
    );
  }
  const txRows = txs.filter((row) => row.hash && row.from && row.to);
  if (txRows.length) {
    await client.query(
      `INSERT INTO chain_txs (hash, height, at, from_address, to_address, asset)
       SELECT * FROM unnest($1::text[], $2::bigint[], $3::bigint[], $4::text[], $5::text[], $6::text[])`,
      [
        txRows.map((row) => row.hash),
        txRows.map((row) => row.height || 0),
        txRows.map((row) => row.at || 0),
        txRows.map((row) => row.from),
        txRows.map((row) => row.to),
        txRows.map((row) => row.token || "ZCOIN"),
      ],
    );
  }
  const coinRows = coins.filter((row) => row.mint && row.symbol);
  if (coinRows.length) {
    await client.query(
      `INSERT INTO chain_coins (mint, symbol, created_at)
       SELECT * FROM unnest($1::text[], $2::text[], $3::bigint[])`,
      [coinRows.map((row) => row.mint), coinRows.map((row) => row.symbol), coinRows.map((row) => row.createdAt || 0)],
    );
  }
  const stakeRows = stakes.filter((row) => row.id && row.address && row.validatorId);
  if (stakeRows.length) {
    await client.query(
      `INSERT INTO chain_stakes (id, address, validator_id, amount)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])`,
      [stakeRows.map((row) => row.id), stakeRows.map((row) => row.address), stakeRows.map((row) => row.validatorId), stakeRows.map((row) => row.amount || "0")],
    );
  }
  const proposalRows = proposals.filter((row) => row.id && row.status && row.author);
  if (proposalRows.length) {
    await client.query(
      `INSERT INTO chain_proposals (id, status, author)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])`,
      [proposalRows.map((row) => row.id), proposalRows.map((row) => row.status), proposalRows.map((row) => row.author)],
    );
  }
}

export function postgresBytes(): number {
  return cachedBytes;
}
