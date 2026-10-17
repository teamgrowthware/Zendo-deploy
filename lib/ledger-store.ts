import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./paths";
import { journalRows } from "./double-entry";
import { closePostgres, postgresBytes, usingPostgres } from "./ledger-pg";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
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
  seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  debit TEXT NOT NULL,
  credit TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount TEXT NOT NULL
);
`;

type AccountBalances = { balances?: Record<string, string> };

let db: DatabaseSync | null = null;
let openedAt = "";

export function ledgerPath(): string {
  return path.join(dataDir(), "zendo.sqlite");
}

export function ledgerBytes(): number {
  if (usingPostgres()) return postgresBytes();
  const base = ledgerPath();
  let total = 0;
  for (const file of [base, `${base}-wal`, `${base}-shm`]) {
    try {
      total += statSync(/*turbopackIgnore: true*/ file).size;
    } catch {
      /* missing sidecar */
    }
  }
  return total;
}

export function closeLedger() {
  void closePostgres();
  if (!db) return;
  try {
    db.close();
  } catch {
    /* already closed */
  }
  db = null;
  openedAt = "";
}

export function openLedger(): DatabaseSync {
  const file = ledgerPath();
  if (db && openedAt === file) return db;
  closeLedger();
  mkdirSync(dataDir(), { recursive: true });
  const next = new DatabaseSync(file);
  next.exec(SCHEMA);
  importJsonOnce(next);
  db = next;
  openedAt = file;
  return next;
}

function importJsonOnce(database: DatabaseSync) {
  const existing = database.prepare("SELECT revision FROM documents WHERE id = 'chain'").get();
  if (existing) return;
  const file = path.join(dataDir(), "state.json");
  if (!existsSync(file)) return;
  let parsed: { version?: number; accounts?: Record<string, AccountBalances>; bridgeReplay?: unknown };
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as typeof parsed;
  } catch {
    return;
  }
  if (!parsed || parsed.version !== 2 || !parsed.accounts) return;
  const replay = Array.isArray(parsed.bridgeReplay) ? parsed.bridgeReplay.filter((key) => typeof key === "string") : [];
  writeDocument(database, JSON.stringify(parsed), parsed.accounts, replay);
  renameSync(file, `${file}.imported`);
}

function writeDocument(database: DatabaseSync, body: string, accounts: Record<string, AccountBalances>, replay: string[]) {
  const row = database.prepare("SELECT revision FROM documents WHERE id = 'chain'").get() as { revision?: number } | undefined;
  const revision = Number(row?.revision || 0) + 1;
  database.prepare(
    "INSERT INTO documents (id, revision, body) VALUES ('chain', ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, body = excluded.body",
  ).run(revision, body);
  database.exec("DELETE FROM balances");
  const insert = database.prepare("INSERT INTO balances (address, asset, amount) VALUES (?, ?, ?)");
  for (const [address, account] of Object.entries(accounts)) {
    for (const [asset, amount] of Object.entries(account.balances || {})) {
      if (!amount || amount === "0") continue;
      insert.run(address, asset, amount);
    }
  }
  const guard = database.prepare("INSERT OR IGNORE INTO replay_guards (key, kind, detail, seen_at) VALUES (?, ?, ?, ?)");
  const now = Date.now();
  for (const key of replay) {
    guard.run(key, key.startsWith("release:") ? "release" : "lock", key, now);
  }
  database.exec("DELETE FROM transfers");
  const transfer = database.prepare("INSERT INTO transfers (id, at, debit, credit, asset, amount) VALUES (?, ?, ?, ?, ?, ?)");
  for (const entry of journalRows(body)) {
    transfer.run(entry.id, entry.at, entry.debit, entry.credit, entry.asset, entry.amount);
  }
}

export function persistLedger(body: string, accounts: Record<string, AccountBalances>, replay: string[]) {
  const database = openLedger();
  database.exec("BEGIN IMMEDIATE");
  try {
    writeDocument(database, body, accounts, replay);
    database.exec("COMMIT");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* rollback already finished */
    }
    throw error;
  }
}

export function loadLedger(): { body: string; replay: string[] } | null {
  const database = openLedger();
  const row = database.prepare("SELECT body FROM documents WHERE id = 'chain'").get() as { body?: string } | undefined;
  if (!row?.body) return null;
  const guards = database.prepare("SELECT key FROM replay_guards").all() as { key?: string }[];
  return {
    body: row.body,
    replay: guards.map((item) => String(item.key || "")).filter(Boolean),
  };
}

export function readBalance(address: string, asset = "ZCOIN"): string {
  const database = openLedger();
  const row = database.prepare("SELECT amount FROM balances WHERE address = ? AND asset = ?").get(address, asset) as { amount?: string } | undefined;
  return row?.amount || "0";
}

/** Adds delta inside BEGIN IMMEDIATE so overlapping writers cannot drop an update. */
export function addBalance(address: string, asset: string, delta: bigint): string {
  if (delta === 0n) return readBalance(address, asset);
  const database = openLedger();
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database.prepare("SELECT amount FROM balances WHERE address = ? AND asset = ?").get(address, asset) as { amount?: string } | undefined;
    const next = BigInt(row?.amount || "0") + delta;
    if (next < 0n) throw new Error("Balance cannot go below zero.");
    database.prepare(
      "INSERT INTO balances (address, asset, amount) VALUES (?, ?, ?) ON CONFLICT(address, asset) DO UPDATE SET amount = excluded.amount",
    ).run(address, asset, next.toString());
    database.exec("COMMIT");
    return next.toString();
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* rollback already finished */
    }
    throw error;
  }
}
