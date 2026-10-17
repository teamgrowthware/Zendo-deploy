-- Same tables as data/zendo.sqlite. D1 is SQLite. Do not put balances in KV.
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
