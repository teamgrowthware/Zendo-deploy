# Security

## Non-custodial assumptions

Zendo accounts are ledger rows. The server stores a hash of the 12-word phrase, not the phrase and not an external private key. External deposits and withdrawals are signed in the user's own wallet. The oracle reads receipts. It does not hold a signing key for Ethereum, BSC, Polygon, Avalanche, or Solana.

This architecture is meant to avoid taking custody of user funds. Whether an operator needs a money-transmitter license depends on what the operator actually does and on the law that applies. This document is not a legal opinion, and it is not a claim that no license is required.

## Do not add custody

Do not add a feature that:

- accepts a user's external private key, seed phrase, or keystore
- broadcasts a transaction on another chain on the user's behalf
- holds a hot wallet that can move user deposits
- lets one user withdraw another user's external tokens

A protocol treasury that receives fees already recorded on the Zendo ledger is not an external custodian. Do not extend it into a pooled wallet on another chain.

## Bridge and oracle

- Observations must agree across the configured number of independent hosts.
- Confirmation depth comes from the asset entry.
- A disagreeing or shallow event is quarantined and is not minted.
- The same chain, transaction, and log index cannot mint twice.
- A burn fails when the synthetic balance is too small.
- RPC URLs must be https, except a localhost endpoint for a private node.
- The adapter refuses `http://` endpoints that are not local. It does not implement `eth_sendRawTransaction`.
- Admin registration uses `ZENDO_CHAIN_ADMIN_TOKEN` from the environment. The token is not stored in the repo.

The existing Polygon ZendoCoin bridge is a separate lock-and-release path for ZCOIN. It is not a general custodian for the external asset registry.

## Limits

Tests cover the state machine, the registry size, mocked adapters, fees, mint and burn, and meme launch and trade. They do not prove the absence of every bug. Review RPC endpoints and the admin token before exposing a writer beyond localhost.
