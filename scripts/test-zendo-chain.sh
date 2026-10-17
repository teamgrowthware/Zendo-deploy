#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
cargo build --manifest-path zendo-chain/Cargo.toml --offline
cargo test --manifest-path zendo-chain/Cargo.toml --offline
