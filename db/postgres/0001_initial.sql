-- Zendo hosted PostgreSQL schema. Applied by scripts/postgres-migrate.mjs.
-- This is idempotent and contains no credentials or seeded accounts.
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
