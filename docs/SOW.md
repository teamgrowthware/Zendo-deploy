# Zendo statement of work

Version 0.9.0. Internal engineering scope for teammates working on this repository. It describes the work the software already contains and the rules for changing it. It is not a client contract, not a price quote, and not legal advice. Commercial terms, a launch date, and any license decision are outside this document. See `docs/BRD.md` for the requirements and `SECURITY.md` for custody limits.

## 1. Purpose

Give a new teammate one place that says what to build, what is already built, what must not change, and how to check the work. The product is the Zendo node: the website, the ZendoCoin ledger, the launchpad, and the related desks described in the BRD.

## 2. Current delivery

This repository is the work product. Version 0.9.0. Chain id on the website ledger is `zendo-1`.

| Area | Where it lives | Status in this tree |
| --- | --- | --- |
| Site, wallet, launchpad, explorer, staking, governance, grants, market, social, support | Next.js app under `app/`, `components/`, `lib/engine.ts` | Implemented as one process |
| Ledger | `data/zendo.sqlite`, or PostgreSQL when `ZENDO_DATABASE_URL` is set | zendo-1 ledger on the host |
| ZendoCoin allocations | `founders.json`, `lib/zendo-founders.ts` | 1,000,000,000 total; 700,000,000 public; 300,000,000 founders. Louis Conner is Co-founder and President |
| Vesting | `lib/vesting.ts`, `lib/config.ts` | 120-day cliff, then 25% each year for 4 years, clock starts on first public HTTPS serve |
| External assets | `zendo-chain/config/external-assets.json`, `lib/external.ts` | 1,500 registry slots; synthetic credits only after two agreeing observations |
| Polygon token and bridge | `polygon/contracts/`, `polygon/scripts/` | Solidity and deploy scripts; no saved contract address |
| Rust node | `node/` | Separate ledger and stack machine; not the website wallet |
| Rust chain core | `zendo-chain/` | Registry, fees, CLI; must not write `data/state.json` |
| Phone and desktop shells | `android/`, `ios/` | Display the site; no second ledger |
| Docs | `README.md`, `SECURITY.md`, `docs/whitepaper-body.html`, this file, `docs/BRD.md` | English white paper plus es, zh, hi, ar |
| Release zip | `downloads/Zendo.zip` | Tracked project files for a direct download |

`data/zendo.sqlite` is the ledger for that host. It is not copied into the public source archive.

## 3. Work a teammate is expected to do

1. Read `docs/BRD.md`, `README.md`, and `SECURITY.md` before changing ledger, bridge, or account code.
2. Keep a single writer for `data/state.json`.
3. Keep ZendoCoin supply, decimals, public allocation, founder amounts, and the vesting schedule fixed unless the product owner changes `founders.json` and every reader of that file in the same change.
4. Keep external signing in the user’s wallet. Do not add a feature that accepts a private key, seed phrase, or keystore for another chain, broadcasts those transactions, or holds a hot wallet that can move user deposits.
5. Keep the Polygon bridge as lock-and-release of ZCOIN already in the vault. Do not add minting to `ZendoBridge`.
6. Rotate the seeded operator password, PIN, and recovery phrase before a host is reachable by anyone else. Do not commit the new secrets.
7. Supply `POLYGON_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, and founder Polygon addresses only through the environment when a broadcast is actually required. Do not commit them.
8. Run `npm test` for TypeScript changes and the Rust tests named in the README when those trees change.
9. Reprint white-paper PDFs when the version or the white-paper source changes, so the stamp still matches.

## 4. Work this statement does not assign

- Choosing a production launch date. None is recorded.
- Buying Cloudflare, a domain, a Polygon RPC account, or a market-data account. None of those credentials are in the repo.
- Deploying ZendoCoin or the bridge to Polygon. The scripts are dry-run until the environment is set.
- Deciding that no money-transmitter or other license is required.
- Declaring a public launch lawful.
- Submitting the Android or iOS shell to an app store. Store review is a separate step, and Apple often rejects a website inside a WebView.
- Pointing `zendo-chain` at `data/state.json`.

## 5. Environments

| Environment | Rule |
| --- | --- |
| Local | `npm run dev` serves the site. The ledger file is on disk. Rust RPC stays on localhost. |
| Public host | One process, one volume, HTTPS, secure cookies, public HTTP refused, operator secrets rotated. |
| Polygon | ZendoCoin launch accepts chain id 137 only. A broadcast needs the RPC URL and deployer key. The phone package is `ZendoCoin-Polygon_Mainnet.zip`. |

## 6. Done when

A change is done when:

- The behavior matches `docs/BRD.md` and the sections of the README it touches.
- Custody boundaries in `SECURITY.md` still hold.
- Allocations still sum to 1,000,000,000 if `founders.json` was touched.
- Tests listed in section 3 pass.
- Secrets added for a deploy are not in git.
- The white-paper stamp still matches if those files changed.

## 7. References

- `docs/BRD.md` — requirements
- `README.md` — run, fees, operator, node
- `SECURITY.md` — non-custodial rules
- `docs/whitepaper-body.html` — product description
- `docs/LAUNCH.md` — what version 0.9.0 ships
- `docs/onboarding.md` — new-member path
- `founders.json` — allocation table
