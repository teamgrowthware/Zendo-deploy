# Standalone zendo-1

ZendoCoin on this network is the gas token. A transfer spends `0.001` Z. Creating a meme coin spends `0.2` Z. A trade spends `0.0005` Z plus the curve fee. None of those fees are MATIC or POL.

The website, iOS app, and Android app read the same ledger. Blocks, trades, and order books leave that ledger through `/api/stream`, GraphQL, and the WebSocket port. The connection cap stays at 20,000. Jobs stay on the `zendo:jobs` stream. Writes stay on `ZENDO_DATABASE_URL`. Reads can use `ZENDO_DATABASE_REPLICA_URL`.

Polygon chain 137 remains an optional place to read an external ZendoCoin token. It is not required to launch or trade a meme coin.

## Genesis

`zendo-chain/genesis/zendo-1.json` records the public numbers:

- 1,000,000,000 Z total
- 700,000,000 Z public
- 300,000,000 Z founder vesting
- 100,000 Z operator bucket inside the public allocation

Private operator and bridge keys stay in `data/` with mode `0600`. They are not in the genesis file.

## Read-model reconciliation

The website's ledger is a read model. It is a projection of confirmed `zendo-1` state, never the other
way around: reconciliation reads the chain and writes the projection, so a read-model failure can never
change the chain.

`GET /api/l1/reconcile` (operator only) reports the checkpoint: the highest reconciled height, the count
of applied transaction ids, observed fees, and the last report. `POST /api/l1/reconcile` folds confirmed
transfers in; `POST` with `{"rebuild": true}` clears the checkpoint and replays every confirmed transfer
from genesis. Each transfer is applied once, keyed by transaction id, so a restart, a replay, or a
rebuild never double counts. If a block cannot be read the pass stops at the last applied height and
records the reason, so the next pass resumes safely.

A fresh database rebuilds from `zendo-1`:

1. Start with an empty `ZENDO_DATABASE_URL` (or `data/` directory).
2. Boot the app so it writes its genesis allocation.
3. Point `ZENDO_L1_RPC` at the validator and call `POST /api/l1/reconcile` with `{"rebuild": true}`.
4. Confirm `GET /api/l1/reconcile` shows `height` equal to the node's finalized height and an empty
   `errors` list.

Reconciliation layers confirmed L1 movement on top of the app's own genesis allocation; it does not
replace that allocation, because the app ledger and the L1 ledger have different genesis.

## Validator and peers

Build the Rust node, then start it:

```bash
cargo run --manifest-path node/Cargo.toml -- run --data data/validator-0 --listen 127.0.0.1:47110 --rpc 127.0.0.1:47111
```

A second node joins with `--peer 127.0.0.1:47110`. The node produces blocks on its own clock, keeps a validator set, and exchanges blocks over its peer port. This is the consensus engine shipped in the repository. CometBFT is not bundled.

Check a running RPC when you have set one:

```bash
ZENDO_L1_RPC=http://127.0.0.1:47111 node scripts/host-check.mjs
```

`host-check` also checks that `data/bridge.key` and `data/operator.key`, when those files exist, are mode `0600`.

## Launchpad

Creating a coin in the app writes the coin on `zendo-1`. The deploy helper checks that path:

```bash
node scripts/deploy-l1.mjs
```

## Kubernetes

- `k8s/deployment.yaml` runs the website.
- `k8s/gateway.yaml` is the public entry.
- `k8s/shards.yaml` splits account ownership.
- `k8s/replicas.yaml` is the read path.
- `k8s/validators.yaml` runs the Rust validator and its RPC.

Apply the validator set only after the `zendo-node:local` image exists on the cluster.

The public source package is `ZendoL-1_App.zip`. It contains the tracked tree: the website, the Rust node, genesis, mobile shells, and the deployment notes. Install with `npm install`, then `npm run dev`.

## High-concurrency database and cache

Point `ZENDO_DATABASE_URL` at PgBouncer in transaction mode, and `ZENDO_DATABASE_REPLICA_URL` at a replica bouncer when reads should leave the primary. Each app process opens its own pool (`ZENDO_PG_POOL_MAX`, default 20, hard cap 100). Idle, connect, and statement timeouts are `ZENDO_PG_IDLE_MS`, `ZENDO_PG_CONNECT_MS`, and `ZENDO_PG_STATEMENT_MS`. Keep the per-process pool at 4–10 when many processes share one bouncer.

The Postgres schema indexes addresses on balances, transfers, and `chain_stakes`, transaction hashes and block heights on `chain_txs` and `chain_blocks`, coin creation on `chain_coins` (`symbol`, `created_at`), and governance proposals on `chain_proposals` (`status`, `author`). The writer refreshes those side tables inside the same commit as the ledger document.

`ZENDO_REDIS_URL` is the shared cache and the `zendo:jobs` stream. Block-height RPC answers stay cached for one second. A new coin is cached for 30 seconds and publishes a `coin-create` job. Launchpad trades publish a `launchpad-trade` job after settlement. Ledger commits publish `ledger-commit`. Sign-in and RPC limits use the same cache, with an in-process counter when Redis is unset. Cross-origin browser calls are accepted only from `ZENDO_PUBLIC_ORIGIN`. Session cookies are `Secure` when that origin is `https`, or when `ZENDO_SECURE_COOKIES=1`.

The phone archive is `ZendoDeployL1.zip`. `ZendoL-1_App.zip` is the same tracked tree. Both are served with `Content-Disposition: attachment` and an unquoted filename.
