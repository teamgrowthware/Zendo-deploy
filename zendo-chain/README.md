# Zendo chain core

Native block production for `zendo-1` lives in `node/`. Start it with `cargo run --manifest-path node/Cargo.toml -- run --data data/validator-0 --listen 127.0.0.1:47110 --rpc 127.0.0.1:47111`. Peers are added with `--peer`. Fees on that network are ZendoCoin. Genesis amounts are in `zendo-chain/genesis/zendo-1.json`. The deployment notes are in `docs/standalone-l1.md`.

This directory is the single-writer log for external assets. The website process remains the only writer of `data/state.json`. This binary keeps its own append-only log under a data directory you choose. Do not point it at `data/state.json`.

## Run a writer

```bash
cargo run --manifest-path zendo-chain/Cargo.toml -- writer --data data/zendo-chain --bind 127.0.0.1:47221 --registry zendo-chain/config/external-assets.json
```

The writer loads the registry, appends blocks, and serves `GET /v1/balances`, `GET /v1/assets`, `POST /v1/accounts`, `POST /v1/meme`, `POST /v1/trade`, `POST /v1/assets`, and `POST /v1/observe` on localhost. Asset registration requires `ZENDO_CHAIN_ADMIN_TOKEN`. There is no key store.

## Run a replica

```bash
cargo run --manifest-path zendo-chain/Cargo.toml -- replica --log data/zendo-chain/blocks.jsonl
```

A replica replays the log and prints the height. It does not append.

## Configure assets

```bash
cargo run --manifest-path zendo-chain/Cargo.toml -- assets validate --registry zendo-chain/config/external-assets.json
cargo run --manifest-path zendo-chain/Cargo.toml -- assets expand --count 1500 --registry zendo-chain/config/external-assets.json
```

Each entry names a chain, a token identifier, an event topic, confirmation depth, and at least two sources once RPC URLs are set. Empty `rpcs` means the slot is registered and idle. No code change is required to add a slot.

## Wallets

Users lock or burn tokens in MetaMask, Phantom, Trust Wallet, or another wallet they control. Zendo reads events. It never asks for a seed phrase for those networks and never broadcasts a withdrawal.
