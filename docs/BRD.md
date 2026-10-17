# Zendo business requirements

Version 0.9.0. Internal description of the software in this repository, written so a new teammate can see what the product is required to do. This is not a contract, not an offer of securities, and not a legal opinion. Whether an operator needs a money-transmitter or other license depends on what they do and where they do it.

Source of truth when this note and the code disagree: the code, then `README.md`, `SECURITY.md`, and `docs/whitepaper-body.html`.

## 1. Product

Zendo is one Next.js process that serves the website, the wallet, the launchpad, the explorer, staking, governance, grants, the marketplace, social, and the Polygon bridge desk. Balances for that site live in `data/state.json` on the machine that runs the process. They survive a restart.

A separate Rust program, `zendo-node`, keeps its own blocks and a small stack machine. The website does not send wallet transfers through that program. A second Rust program, `zendo-chain`, keeps an external-asset registry and must not write `data/state.json`.

The public site is the product on phones, tablets, and desktops. Android and iOS shells, when present, only display that site. They do not keep a second ledger.

## 2. Users

| Role | What they need |
| --- | --- |
| New member | Sign up, write down a 12-word phrase, set a PIN, and start at 0 ZCoin. |
| Holder | Send and receive ZCoin or a launchpad token, see a receive QR, stake, and claim rewards. |
| Creator | Launch a coin, reply, and optionally promote it. |
| Voter | Open proposals and grants and vote with token weight. |
| Operator | Run one node, pause accounts, answer support tickets, and watch health. The seeded operator is an admin and must be rotated before anyone else can reach the node. |
| Founder | Receive vested ZendoCoin on the schedule below. The chain moves unlocked coins. No operator claim button. |

## 3. ZendoCoin

| Item | Requirement |
| --- | --- |
| Name and ticker | ZendoCoin, ticker `$ZCoin`. |
| Decimals | 18. Fixed. A vote cannot change this. |
| Total supply | 1,000,000,000. Fixed. A vote cannot change the base supply. |
| Public allocation | 700,000,000, liquid from genesis. Includes the system wallet seed, the grant treasury, the launchpad studio, and the remaining public pool. |
| Louis Conner | Co-founder and President. 200,000,000, locked in a vesting account. Polygon wallet `0x18a0730008034177b40F1172aA5953a37dAE7102`. |
| Prabhat Agrawal | Founder. 50,000,000, locked. Polygon wallet `0xD319679625599303393084671a3AdaB52ea999B3`. |
| Pratyaksh Lutare | Founder. 50,000,000, locked. Polygon wallet `0x3336a52Cd82F01956147aed641F35694a235fbc9`. |
| Founder total | 300,000,000. |
| New accounts | 0 ZCoin. The faucet does not pay at signup. |
| Inflation | Staking rewards only, minted when a delegator claims, at the configured annual rate (8% APR in the current fee table), after validator commission. |
| Conservation | Spendable balances, validator self-stake, delegations, and unbonding equal the base supply plus rewards already issued. The node checks that sum before it writes state. |

The same numbers are in `founders.json`. The Polygon deploy script reads that file. Do not keep a second allocation table.

### Vesting

Each founder has a vesting account and a separate wallet. Both addresses start with `znd1`.

The vesting clock is unset until the app is first served on a public HTTPS host. That instant is stored once. It is not a date chosen in advance. Nothing unlocks before that moment. Nothing unlocks during the 120-day cliff, including on the cliff day. After the cliff, 25% of that founder’s own allocation unlocks at each anniversary for four years. Locked coins stay in the vesting account. Unlocked coins move to that founder’s wallet on the block timer. They are not credited to the system wallet.

A governance vote cannot change this schedule.

## 4. What members can do

- **Launchpad.** Create a coin for 0.2 Z. The creator does not receive the supply. Price follows a constant-product curve against virtual reserves. Each trade pays 1%: 0.30% to the creator and 0.70% to the protocol, plus gas of 0.0005 Z. At 85 Z of real reserves the curve graduates into a pool. A promoted slot costs 50 Z for 24 hours. An optional extra protocol fee of 0.05% stays off until an operator turns it on, and that switch does not reorder other people’s transactions.
- **Wallet.** Receive with a QR, send ZCoin or a launchpad token, stake, unstake, and claim. Transfer fee is 0.001 Z. Stake and unstake cost 0.001 Z.
- **Governance.** A proposal costs 1 Z and needs 100 Z of voting power to open. It names one allowed parameter. A vote weighs liquid ZCoin plus delegated stake, snapshotted at vote time, and costs 0.002 Z. Quorum is 1,000 Z. A passing vote writes that parameter into the live config. Later blocks use it.
- **Grants.** Same voting power. Yes votes need 1,000 ZCoin. On a live node the payout waits 60 seconds. A paid grant moves Z from the treasury to the author and does not mint new supply.
- **Slashing.** Jailing a validator moves 10% of its self-stake and of each delegation to the treasury and pauses rewards. A second jail does not slash again. The slash is not refunded.
- **Explorer and search.** Blocks, transactions, addresses, contracts, validators, staking, and network stats. Search suggests accounts, coins, blocks, transactions, addresses, and proposals.
- **Marketplace.** A listing records a module name and summary for 1 Z. Each account has one rating from 1 to 5. A later rating replaces the earlier one.
- **Social.** Profiles, follows, posts, stories, video notes, circles, and direct messages, all in `data/state.json`. Stories expire after 24 hours. Video files are not stored. Direct messages stay in the app. No email is sent.
- **Support.** Statuses are open, in progress, resolved, and closed. Users use `/app/support`. Operators reply on `/app/admin`. Desk notes stay on the operator side.
- **History export.** Settings can download that account’s history as JSON or CSV through a short-lived pass.

## 5. Accounts and custody boundaries

Signup stores the password as a bcrypt hash. The wallet address comes from a 12-word BIP39 phrase. The server stores a hash of the phrase, not the words. A 4-digit PIN, also hashed, is required after the password. Five wrong PINs pause entry for five minutes.

Password reset shows a 30-minute link on screen because this build has no mail server. Recovery with the email and the 12 words replaces the password and the PIN.

Sessions are httpOnly cookies. In production they are marked secure, and public HTTP is refused. Loopback health checks stay open.

External tokens stay in the user’s own wallet (MetaMask, Phantom, Trust Wallet, or similar). Zendo does not store those private keys, does not accept a keystore, and does not broadcast those transactions. `eth_sendRawTransaction` is not implemented. The external-asset adapter refuses non-local `http://` RPC URLs.

The 1,500-asset registry in `zendo-chain/config/external-assets.json` covers Ethereum, BSC, Polygon, Avalanche, and Solana. A synthetic credit is written on this ledger only when two independent observations agree on the transaction, the log, the amount, the token, and the confirmation depth. Disagreement or a shallow confirmation is quarantined. The same chain, transaction, and log index cannot mint twice. A burn spends the synthetic balance on this ledger. It does not withdraw the user’s tokens from a Zendo-held wallet.

There is no card processor, no fiat payout, and no separate custodial balance of user funds. Fees on this ledger credit the protocol treasury. That treasury is an on-ledger balance. It must not be turned into a pooled wallet on another chain.

`SECURITY.md` states the limit: this layout is meant to avoid custody. It is not a claim that no license is required.

## 6. Polygon

`polygon/contracts/ZendoCoin.sol` is the ERC-20. The name is ZendoCoin and the ticker is `$ZCoin`. `polygon/contracts/ZendoCoinVesting.sol` locks the three founder allocations. Louis Conner is recorded there as Co-founder and President. `polygon/contracts/ZendoCoinLaunch.sol` deploys both on chain id 137 and sends the 700,000,000 public allocation to the deployer, or to `POLYGON_ADDR_PUBLIC` when that is set. `polygon/contracts/ZendoBridge.sol` is a separate lock-and-release vault. The bridge does not mint. `release` pays $ZCoin already held in the vault after an operator signature. `lock` pulls $ZCoin into the vault and emits the `znd1` account hash.

`polygon/scripts/deploy.mjs` prints the launch plan and can broadcast it. The creation bytecode is `polygon/artifacts/ZendoCoinLaunch.json`. No contract address is saved in the repo. A broadcast needs `POLYGON_RPC_URL` (https, chain id 137, no embedded secret) and `DEPLOYER_PRIVATE_KEY`. The key is never printed. The phone download is `ZendoCoin-Polygon_Mainnet.zip`.

The node default chain id is 137 (`ZENDO_POLYGON_CHAIN_ID`). Nothing in the repo requires Polygon Amoy first. A deposit is credited from a Polygon receipt that names this `znd1` address. A withdrawal locks ZCoin here and signs a voucher the user submits in their own Polygon wallet.

The bridge is only for ZCOIN. It is not a custodian for the 1,500-asset registry.

## 7. Operator and hosting

One process may write `data/state.json`. Two writers corrupt it. A serverless host that wipes the disk forgets wallets. Run one replica against a durable volume.

Production sets secure cookies and refuses public HTTP. Change the seeded operator email, password, PIN, and recovery phrase before the node is reachable by anyone else. Those defaults are still in `lib/seed.ts` and the README. They have not been rotated in source.

Public JSON-RPC is `POST /api/rpc`. Chain reads and writes have no per-minute cap. The Rust RPC stays on localhost and has no authentication.

There is no Cloudflare account, domain, or market-data API key in the repo. Hosting notes describe one VPS and Caddy. `POLYGON_RPC_URL` is supplied at runtime.

`zendo-chain writer` must not be pointed at `data/state.json`.

## 8. Clients

- Web: responsive site, safe-area insets, bottom bar on small screens, header and side nav on wide screens.
- iPhone and iPad: Safari, with Add to Home Screen. The manifest is `standalone`. There is no service worker and no offline mode.
- Android shell: WebView, HTTPS only in the current manifest notes, no second ledger. A sideload keystore in the repo is not a Play upload key.
- iOS shell: WKWebView, bundle id `app.zendo.ios`. Apple often rejects a site wrapped in a WebView. The browser remains the public iOS path.
- White paper: English plus Spanish, Chinese, Hindi, and Arabic. Version stamp must match `package.json`.

## 9. Out of scope for this build

- A second writer of `data/state.json`.
- Storing or broadcasting user keys for other chains.
- Fiat deposits, card payments, or dollar payouts.
- Email delivery. Reset links and support replies stay on screen.
- Offline mode or a service worker.
- Treating the Rust stack machine as an EVM, or sending website transfers through `zendo-node`.
- A legal conclusion that no license is required, and a promise that a public launch is already lawful.
- A committed Polygon mainnet address. None is in the repo.

## 10. Acceptance checks

A teammate can treat the build as meeting this BRD when:

1. `founders.json` still sums to 1,000,000,000. Louis Conner, Co-founder and President, holds 200,000,000. Prabhat Agrawal holds 50,000,000. Pratyaksh Lutare holds 50,000,000. The public allocation is 700,000,000.
2. New signups start at 0 ZCoin and must confirm the phrase and set a PIN.
3. The server stores phrase and PIN hashes, not the phrase and not an external private key.
4. One process owns `data/state.json`.
5. Two disagreeing external observations quarantine, and a repeated event does not mint twice.
6. The bridge vault cannot mint, and a release voucher cannot be replayed.
7. Governance cannot change supply, decimals, or the vesting schedule.
8. `npm test` and the Rust tests named in the README pass on the branch you ship.
9. The seeded operator password is changed before any public host.
