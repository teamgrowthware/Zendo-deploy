# Zendo

Zendo is the zendo-1 network: proof-of-stake blocks, the ZendoCoin ledger, and a bonding-curve launchpad. Balances live in `data/zendo.sqlite` and survive a restart, or in PostgreSQL when `ZENDO_DATABASE_URL` is set. An older `data/state.json` is imported once. The app does not custody fiat.

Operators are responsible for the laws that apply where they run the node. This repository is not legal, financial, or investment advice.

Teammate requirements are in [docs/BRD.md](docs/BRD.md). The engineering scope is in [docs/SOW.md](docs/SOW.md). How to start the standalone network is in [docs/standalone-l1.md](docs/standalone-l1.md).

## zendo-1

The network id is `zendo-1`. Block production is the Rust node in `node/`: `cargo run --manifest-path node/Cargo.toml -- run --data data/validator-0 --listen 127.0.0.1:47110 --rpc 127.0.0.1:47111`. Add another machine with `--peer`. Gas is ZendoCoin: `0.001` Z to send, `0.2` Z to create a coin, `0.0005` Z on a trade. Genesis amounts, including the 700,000,000 public allocation, are in `zendo-chain/genesis/zendo-1.json`. Launchpad coins are created on this chain. Polygon chain 137 is the optional external token and bridge. `node scripts/host-check.mjs` checks `ZENDO_L1_RPC` and requires mode `0600` on `data/operator.key` and `data/bridge.key` when those files exist. The validator pod is `k8s/validators.yaml`. The public source archive is [ZendoL-1_App.zip](/ZendoL-1_App.zip).

## External assets

The chain core in `zendo-chain/` registers external tokens from `zendo-chain/config/external-assets.json`. The shipped file holds 1,500 slots across Ethereum, BSC, Polygon, Avalanche, and Solana. A new token is another JSON entry, or an operator registration in the app. The website still has one writer for `data/state.json`.

A mint happens only when two independent observations agree on the transaction, the log, the amount, the token, and the confirmation depth. A disagreement is quarantined. A burn spends the synthetic balance on this ledger. Users sign the external transaction in MetaMask, Phantom, Trust Wallet, or a similar wallet. Zendo does not store those keys and does not broadcast those transactions.

`zendo-chain writer` serves the local API. `zendo-chain replica` replays `blocks.jsonl` and does not append. Fees for launch, trade, boost, listing, and governance are credited to the protocol treasury on this ledger. See `SECURITY.md`.

The release archive is [ZendoRocks2026.zip](/ZendoRocks2026.zip). It contains the `zendo-chain` binary, config templates, this design, and the example registry.

## Zendo Cross-Platform Availability

Zendo is a responsive web application. The chain, the ZendoCoin wallet, the launchpad, the explorer, staking, governance, and the bridge are one site. That site is what runs on Android, on iOS, on tablets, and in current desktop browsers. Chrome, Safari, Firefox, and Edge open the same node. A phone scrolls the bottom bar across every signed-in destination. A wider window uses the header and the side navigation. The viewport uses the safe area, so a home-screen icon and a notched phone keep the bar above the system inset.

On iPhone and iPad, the public path is the mobile browser. In Safari, Add to Home Screen places Zendo on the home screen. The web app manifest sets `display` to `standalone`, with the Zendo name, the ink background, and the site icon, so that icon opens Zendo in its own window. The root layout also supplies the Apple touch icon. There is no service worker and no offline mode. The home-screen icon still needs the hosted node.

An update to the node is the update on every browser, every home-screen icon, and every wrapper that is pointed at that node. The wallet logic is not copied into the native shells, so a chain fix does not wait on Play review or App Review.

### Optional native shells

The shells only display the site. They do not keep a second ledger.

`android/` is a WebView. It loads HTTPS only, blocks cleartext, disables file access, and does not add a JavaScript interface. Privacy opens `/privacy` on the node you entered. Tablets use the same activity, and the manifest allows orientation and screen-size changes. The downloadable `Zendo.apk` is the older sideload build until you run `assembleRelease` again. That sideload keystore password is in the repo. Do not upload it to Google.

`ios/` is an Xcode project, bundle id `app.zendo.ios`, for iPhone and iPad. It uses WKWebView only. App Transport Security leaves `NSAllowsArbitraryLoads` false. The shell does not download or run an executable. Privacy opens `/privacy`. Listing placeholders are in `ios/AppStore/metadata.txt`. The icon in the asset catalog is a placeholder. Replace it before you submit.

An Android APK cannot be submitted to the Apple App Store. A native App Store binary is this iOS project, plus an Apple Developer Program membership, the privacy-policy URL, and App Review. Apple frequently rejects an app that is only a website inside a WebView. Safari and Add to Home Screen remain the public iOS path that does not depend on that review.

### Publish the Android shell on Google Play

1. Host the site at `https://YOUR_DOMAIN` with the privacy page at `/privacy`.
2. Create an upload keystore that is not `android/zendo-release.jks`. Enroll in Play App Signing.
3. From `android/`, build the bundle with that key and the live node:

```bash
export ZENDO_NODE_URL=https://YOUR_DOMAIN
export ZENDO_STORE_FILE=/absolute/path/upload.jks
export ZENDO_STORE_PASSWORD=...
export ZENDO_KEY_ALIAS=...
export ZENDO_KEY_PASSWORD=...
gradle :app:bundlePlay
```

4. In Play Console, create the app `app.zendo.phone`, paste the listing in `android/play/listing.txt`, set the privacy URL to `https://YOUR_DOMAIN/privacy`, complete data safety and the content rating, and upload the `.aab`.
5. Target API is 35. If Console asks for a newer target, raise `compileSdk` and `targetSdk` together.

Play review is Google’s decision. The shell is ready to upload. It is not already listed.

### Publish the iOS shell on the App Store

1. Open `ios/Zendo.xcodeproj` in Xcode on a Mac. Set the team and a distribution certificate.
2. Set `ZendoNodeURL` in `ios/Zendo/Info.plist` to `https://YOUR_DOMAIN`. Replace the placeholder icon.
3. Archive, upload with Xcode or Transporter, and create the App Store Connect record from `ios/AppStore/metadata.txt`.
4. The privacy URL is `https://YOUR_DOMAIN/privacy`. Put a demo login in the review notes. The binary has no baked account.
5. Answer the age-rating questionnaire. `ITSAppUsesNonExemptEncryption` is false because the app uses system HTTPS.

If App Review rejects the wrapper as a website in a web view, the browser and Add to Home Screen are still the public iOS app. That rejection does not take the website down.

### Company pages, tickets, history, and the zip

These routes are the same site the wrappers load. They are linked from the header Company and Legal menus, the phone menu, and the footer.

| Page | Route | Source |
| --- | --- | --- |
| About us | `/about` | `app/(site)/about/page.tsx` |
| Contact us | `/contact` | `app/(site)/contact/page.tsx` |
| FAQ | `/faq` | `app/(site)/faq/page.tsx` |
| Privacy policy | `/privacy` | `app/(site)/privacy/page.tsx` |
| Terms and conditions | `/terms` | `app/(site)/terms/page.tsx` |
| Support tickets | `/app/support` | `app/app/support/page.tsx` |
| Settings and history | `/app/settings` | `app/app/settings/page.tsx` |

Contact us shows only `zendo2026@proton.me`. There is no phone number and no public form on that page.

Support tickets are stored on `state.tickets` inside `data/state.json`. `submitTicket` and `replyTicket` in `lib/engine.ts` write them. `app/api/support/route.ts` is the HTTP route. The signed-in page lists that account’s tickets and the operator replies. The operator desk at `/app/admin` filters by status and category and saves a reply. No mail is sent.

Download My History is on Settings. It asks `POST /api/wallet/history` for a short-lived pass, then opens `/zendo-history/<pass>/zendo-history.json` or the `.csv` twin. `historyFor` in `lib/engine.ts` collects that wallet’s transactions, stakes, governance rows, and meme-coin activity. The pass lets the Android and iOS downloaders save the file without relying on the session cookie. The response uses `Content-Disposition: attachment; filename=zendo-history.json` with the name unquoted. A range that covers the whole file returns 200.

Settings also stores theme, text size, and contrast in local storage. The root layout applies them before paint. Dark is the default. Light and high contrast are overrides in `app/globals.css`. Sign out on Settings clears the session cookie. Missing routes render `app/not-found.tsx`. A failed render uses `app/error.tsx`, and a failure outside that boundary uses `app/global-error.tsx`. Slow panels use `LoadingPanel` in `components/ui.tsx`.

Search covers accounts, coins, blocks, transactions, addresses, and proposals. The header field asks `GET /api/chain?view=suggest` and shows clickable suggestions. Category chips filter that list on desktop and on the phone menu. A query without one exact page opens `/search`.

Social rows live on the same ledger: `state.follows`, `state.posts`, `state.stories`, `state.videos`, `state.circles`, and `state.messages`. Profiles are `/people/<id>`. Signed-in tools are `/app/social`: follow, mutual friends, posts, stories that expire after 24 hours, video notes (title and caption only), circles, direct messages, and creator analytics. Nothing in that layer changes supply or fees, and no mail is sent.

The home page, download page, and footer link `/ZendoDeployL1.zip`. `proxy.ts` rewrites that path, and `/ZendoL-1_App.zip`, to `lib/phone-zip.ts` and sets `x-zendo-file`. The handler streams the archive as `application/zip`, with `Content-Disposition: attachment; filename=ZendoDeployL1.zip` (or `filename=ZendoL-1_App.zip` for that name), `Accept-Ranges`, and `Cache-Control: private`. A full-file `Range` returns 200. `scripts/pack-public-zip.py` rebuilds it from `git ls-files`, skips other zip files, and stores the APK, images, fonts, keystores, and `bin/zendo-node` without deflate. The node binary is marked executable. The archive does not include `node_modules`, `.next`, or the ledger. Extract it on the host, run `npm install`, then `npm run dev` or the Docker compose file. Set `ZENDO_OPERATOR_PASSWORD` and `ZENDO_OPERATOR_PIN` before a public host.

## Run it

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:38471](http://127.0.0.1:38471).

The Android app is [http://127.0.0.1:38471/Zendo.apk](http://127.0.0.1:38471/Zendo.apk). That address saves `Zendo.apk`, a signed sideload package named Zendo. It is not a Play Store listing. After install, the window opens the node address saved in the app and the page can be pinched to zoom.

The white paper is [http://127.0.0.1:38471/whitepaper.pdf](http://127.0.0.1:38471/whitepaper.pdf). The public source archive is [http://127.0.0.1:38471/ZendoL-1_App.zip](http://127.0.0.1:38471/ZendoL-1_App.zip). That address saves `ZendoL-1_App.zip` with an unquoted filename, and a range that covers the whole file returns 200.

The Polygon mainnet contract package is [http://127.0.0.1:38471/ZendoCoin-Polygon_Mainnet.zip](http://127.0.0.1:38471/ZendoCoin-Polygon_Mainnet.zip). That address saves `ZendoCoin-Polygon_Mainnet.zip`. On Android, open the file from the Files app and choose Extract. It holds the $ZCoin contracts, the vesting lock for Louis Conner (Co-founder and President), Prabhat Agrawal, and Pratyaksh Lutare, the logo, and the deploy script. The same button is on the home page and at [/download](http://127.0.0.1:38471/download).

On Android, open `ZendoL-1_App.zip` from the Files app and choose Extract. The archive holds the site, the chain node, the Android and iOS shells, the white papers, and the hosting notes in `README.md` and `docs/LAUNCH.md`.

The Polygon token launches on chain id 137 only. `node polygon/scripts/deploy.mjs` prints the plan. `--broadcast` needs an https `POLYGON_RPC_URL` and `DEPLOYER_PRIVATE_KEY` and does not print the key. Louis Conner is Co-founder and President. The bridge is a separate lock-and-release path. Set `ZENDO_POLYGON_BRIDGE` and `ZENDO_BRIDGE_PRIVATE_KEY` (or `data/bridge.key`, mode 0600) before a withdrawal will lock coins. Set `POLYGON_RPC_URL` to an https endpoint before a deposit can be checked. `node polygon/scripts/deploy-bridge.mjs` dry-runs unless `--broadcast` is passed. Neither script prints a private key.

```bash
npm test
npm run lint
npm run build
npm start
```

State is written to `data/zendo.sqlite` on first boot (gitignored). Delete that directory's database to reseed the chain. Set `QUICKNODE_POLYGON_RPC_URL` or `POLYGON_RPC_URL` before the bridge observer can read Polygon. Set `ZENDO_POLYGON_BRIDGE` and `ZENDO_BRIDGE_PRIVATE_KEY` before a withdrawal can be signed.

Public contact: [zendo2026@proton.me](mailto:zendo2026@proton.me).

## Hosting

Locally the ledger is SQLite (`data/zendo.sqlite`) when `ZENDO_DATABASE_URL` is unset. Set that URL and the same tables live in PostgreSQL: documents, balances, replay guards, and transfers. Neon and Aurora both provide that URL. `docker compose up` starts Postgres 16, Valkey, and points the app at them. The compose password is for that local stack only. Many app servers can share the primary database. Reads use `ZENDO_DATABASE_REPLICA_URL` when it differs from the primary. A regional app replica still forwards sends, trades, and votes to the primary. The wallet, launchpad, staking, and the rest of the app stay the same. Password and PIN guesses stay limited. Each commit is a database transaction, so overlapping balance updates cannot drop one another. Each send also writes a debit and a credit into `transfers` in that same transaction. That is the double-entry ledger. A TigerBeetle cluster is not started here. Set `TIGERBEETLE_ADDRESSES` only on a host that is already running TigerBeetle. PostgreSQL is the hosted database. It does not, by itself, turn one ledger into a billion commits a second.

`ZENDO_REDIS_URL` points at Valkey or Redis. It caches prices, the launchpad book, and shared sign-in attempt counts, and it mirrors the five-wrong-PIN lock so a read replica cannot serve a stale unlock. Leave it unset and this process keeps that cache in memory. Background notices after a commit are published on the Redis stream `zendo:jobs`. `POST /api/graphql` answers the `live` query in one round trip. `GET /api/stream` pushes `event: block` and `event: market`, and each process stops accepting new streams at `ZENDO_CONNECTION_CAP` (20,000 if unset). More open clients means more gateway processes. A WebSocket for the same feed listens only when `ZENDO_WS_PORT` is set. gRPC listens only when `ZENDO_GRPC_PORT` is set. Set the same `ZENDO_JWT_SECRET` on every app instance so the signed cookie works behind a load balancer. Account hashes pick a shard. Writes for an account that belongs on another shard are refused. Reads use `ZENDO_DATABASE_REPLICA_URL`. `node scripts/host-check.mjs` checks the Cloudflare origin, the Polygon URL, chain 137, and mode 0600 on `bridge.key`. The names and the empty defaults are in `.env.example`. Do not commit a filled `.env`.

Hosted capacity is added by processes, not by a setting on one machine. The app and its features stay one ledger. A replica in each region serves that same app from a copy, and Cloudflare can cache the public pages. Sends, trades, stakes, and votes are forwarded to the primary and commit there, in order, so two regions cannot fork the launchpad or the balances. `k8s/replicas.yaml` is that region deployment. Set the same `ZENDO_FLEET_SECRET` on the primary and on every replica, and set `ZENDO_PRIMARY_URL` on the replicas. Gateways are stateless and hold no ledger. Shards each have their own disk. Shard 0 keeps the genesis supply. A transfer to an address that lives on another shard debits here and credits there once, through a signed receipt. `GET /api/fleet?users=200000000&tps=1000000000` returns the machine count for that load using a planning budget of 20,000 open connections per gateway and 100 sustained transfers per shard. That request is a sizing sheet. It does not make one server do that load. `docker-compose.fleet.yml` is the two-shard shape. `k8s/gateway.yaml` scales the front. `k8s/shards.yaml` gives each shard its own volume. Set `ZENDO_SHARD_SECRET` before coins move between shards. The single-process `docker-compose.yml` remains the one-machine node. Docker restarts the container unless you stop it. A serverless host that wipes the filesystem will forget wallets on the next deploy. Run one process against the volume. The same SQL is in `cloudflare/d1-schema.sql` for Cloudflare D1. Explorer lists show 24 rows per page. The edge worker in `cloudflare/worker.mjs` checks HTTPS and validates launch, transfer, withdraw, and deposit requests before they reach the origin.

| Host | What you pay | Notes |
| --- | --- | --- |
| Oracle Cloud Always Free | $0 | One small VM. You manage Docker, HTTPS, and backups. Capacity is limited and accounts are sometimes hard to open. |
| Hetzner CX22 | about €4 to €6 / month | 2 vCPU, 4 GB RAM, 40 GB disk. Enough for this single-node chain. Add a domain (~$10 / year). |
| DigitalOcean or Linode 1 GB | about $6 / month | Same shape: one droplet, Docker Compose, a volume for `data/`. |
| Fly.io shared CPU + 1 GB volume | about $5 to $8 / month | `fly.toml` is not in the repo; the Dockerfile is. Volume must be mounted on `/app/data`. |

A realistic public setup is one €5 VPS, Caddy for HTTPS, and `docker compose up -d`. Production sets secure cookies and refuses public HTTP. Loopback health checks stay open. Change the seeded operator password before anyone else can reach the node. Password reset links are shown in the app because there is no mail server. Public JSON-RPC is `POST /api/rpc`. Chain reads and writes have no per-minute cap. The Rust RPC stays on localhost.

## Operator account

A fresh ledger creates one admin from `lib/seed.ts`. Before the node is reachable by anyone else, set `ZENDO_OPERATOR_PASSWORD` and `ZENDO_OPERATOR_PIN` and start from an empty data directory so those values are hashed into the new ledger. The sign-in page does not print them. Sign-in asks for the password, then the 4-digit PIN. Five wrong PINs lock the account for five minutes.

## Accounts

1. **Sign up** with email, password, and a display name. Each account gets its own `znd1` address and **0 ZCoin**. The faucet is closed.
2. Write down the **12-word phrase**, then confirm three of the words.
3. Set a **4-digit PIN**. The phrase is not stored. Password and PIN hashes are.
4. **Forgot password** creates a 30-minute reset link and shows it in the app (there is no mail server). The operator desk also keeps a copy.
5. **Recover** with the email and the 12 words. That replaces the password and PIN and signs you in.

Sessions are httpOnly cookies. In production they are marked secure, so the browser sends them only over HTTPS.

## What you can do

- **Launchpad** — create a coin, buy and sell on the curve, reply, vote, and report. A coin graduates into a pool after 85 Z of real reserves.
- **Wallet** — receive (QR), send ZCoin or a launchpad token, stake, and claim rewards.
- **Governance** — token-weighted proposals. A passing vote writes one allowed parameter into the live chain config. Supply, decimals, and vesting stay fixed.
- **Slashing** — jailing a validator moves 10% of its self-stake and delegations to the treasury and pauses rewards. A second jail does not slash again.
- **Explorer** — blocks, transactions, addresses, contracts, validators, staking, and network stats.
- **Search** — suggestions for accounts, coins, blocks, transactions, addresses, and proposals, with category filters.
- **Social** (`/app/social`) — profiles, follows, mutual friends, posts, stories, video notes, circles, direct messages, and creator analytics.
- **Company and Legal menus** — About, FAQ, Contact, Developers, Privacy, and Terms.
- **Operator desk** (`/app/admin`) — accounts, roles, pauses, support tickets and desk notes, launchpad reports, proposals, grants, live parameters, system health, the project zip, and validator tools.

## Fees on zendo-1

| Action | Cost |
| --- | --- |
| Transfer | 0.001 Z |
| Trade gas | 0.0005 Z, plus 1% of notional (0.30% creator, 0.70% treasury) |
| Create a coin | 0.2 Z |
| Proposal | 1 Z (needs 100 Z of voting power) |
| Promoted slot | 50 Z for 24 hours |
| Stake / unstake | 0.001 Z |

Staking pays 8% APR from newly issued ZCoin, after validator commission. Founder locks are 300,000,000 of the 1,000,000,000 $ZCoin supply: Louis Conner, Co-founder and President, 200,000,000; Prabhat Agrawal 50,000,000; Pratyaksh Lutare 50,000,000. The other 700,000,000 is public and liquid. The vesting clock stays unset until the app is first served on a public HTTPS host. That moment is stored once, with no operator step. A 120-day cliff follows, then 25% of each founder allocation unlocks each year. Nothing unlocks at the cliff itself. The chain moves unlocked coins into the founder wallets on the block timer. It does not pay the system wallet. The Polygon mainnet contracts use the same amounts and the same 120-day cliff. Louis Conner's title is stored on the vesting contract. The phone package is `ZendoCoin-Polygon_Mainnet.zip`.

Optional MEV adds 0.05% to the protocol side of a trade. It is off until an operator turns it on.

## Node

`node/` is a Rust process with its own ledger. It creates a genesis block, checks transfer signatures, appends blocks to disk, and answers JSON-RPC on localhost. The website still keeps a separate ledger file and does not send wallet transfers through this process.

Peers are not only the addresses you pass on the command line. Each node advertises its listen address and up to 32 neighbors. A dialer retries those addresses and drops a peer after five failures. A second `--data` directory is a separate chain: the two processes learn each other, and they do not import each other's blocks, because each genesis has its own validator key. A block that does not extend the tip is stored aside. If those blocks form a longer chain back to this genesis, and the shared ancestor is at or above the finalized height (tip minus 2), the node replays that chain and counts a reorg. A longer chain that forks below finalized history is ignored. Depth finality does not wait for peers. A validator vote finalizes a block once a quorum has signed that hash. Signing two different blocks at the same height, or voting for both, burns 10% of that validator's balance. `block_reward` in the node meta is paid to the proposer and is 0 until you set it. `add_validator` appends a public key and later slots rotate across the set. The local key only produces a block on its own slots.

```bash
cd node
cargo test
cargo run -- run --data ../node-data --listen 127.0.0.1:47110 --rpc 127.0.0.1:47111 --peer 127.0.0.1:47112
```

Run a second copy with `--listen 127.0.0.1:47112 --rpc 127.0.0.1:47113 --peer 127.0.0.1:47110` and a different `--data` directory. That second directory is its own chain until it joins the first genesis. Before the first block, `zendo-node enroll --data <dir> --public <64 hex>` adds a validator. `zendo-node join --data <new dir> --from <genesis dir> --secret <64 hex>` copies that genesis and signs with the enrolled key. Each key produces only on its own slots. Depth finality keeps advancing from the blocks that do arrive. Vote finality still needs a quorum, so a quiet signer is not counted as someone else's vote. `--region us-east` is sent in the hello message and shown on the consensus page. Dials are ordered by measured round trip. `/explorer/consensus` reads `zendo_consensus` and `zendo_peers` from `http://127.0.0.1:47111` (override with `ZENDO_L1_RPC`, which must stay on localhost).

`zendo-node transfer --data ../node-data --to <40 hex chars> --amount 10` queues a payment from the node's key and produces a block when that key is the proposer. The RPC port should stay on localhost. It has no authentication.

The same process runs a stack machine for contracts. A transaction whose `to` address is 20 zero bytes deploys the hex `data` as code and runs it once. A later transaction to that address runs the stored code; empty `data` is still a call when the account has code, and non-empty `data` is calldata covered by the signature. Gas is the fee: unused gas is refunded, a revert rolls storage back, and an unknown opcode burns the whole fee. `zendo_getCode` and `zendo_getStorage` read the result. Calldata is a sequence of 32-byte words. `STOP` ends execution. This machine is not the website ledger, and it is not an EVM.

`node/src/contracts.rs` builds six programs on that machine. `CALL` pops a callee address, one argument word, and a selector, forwards those 64 bytes, and pushes a 32-byte return word when the callee returns one. The deploying account can replace that code with a payload whose first byte is `A1`, and restore the previous body with `A2`. Anyone else is rejected. `zendo_getCodeInfo` returns the code, the admin, and how many previous bodies are kept.

| Program | What it stores | What a call does |
| --- | --- | --- |
| Token | Supply in slot 1. Balances at the holder's address word. | Selector 1 reads a balance. Selector 2 transfers and logs the recipient and amount. |
| Vesting | Beneficiary, total, start, cliff, period, and claimed amount. | Selector 1 pays the beneficiary in native coins. Nothing is paid at the cliff. The rest vests in a straight line. |
| Curve | Virtual Z reserve, token reserve, and their product. | Selector 1 buys with the transaction value, taking a 1% fee. Selector 2 sells tokens back for Z. |
| Governance | Latest proposal id, yes votes at 100 + id, no votes at 200 + id. | Selector 1 opens a proposal. Selector 2 casts one ballot per account. |
| NFT | Next id in slot 1. Owner of id N at slot 1000 + N. | Selector 1 reads the owner. Selector 2 mints to the caller. Selector 3 transfers, and a second transfer by the old owner reverts. |
| Identity | A name word at each account's address. A reader stores the identity address in slot 1. | Selector 1 registers the caller's name. Selector 2 returns a name. The reader binds that contract and calls lookup. |

`zendo_call` runs bytecode against a copy of state and returns status, gas, return data, and logs. `zendo_governance` reads proposal tallies from a governance contract address. `zendo_staking` lists bonds. Coins sent to `0000000000000000000000000000000000000001` with a 5-byte payload (`01` plus a validator index, or `02` to withdraw) are bonded onto that validator. A slash debits the validator balance, and a withdrawal that no longer fits is rejected. `zendo-node stake`, `unstake`, and `call` drive those paths from the CLI.

## Developer surface

- TypeScript client: `createZendoClient` in `lib/sdk.ts` (`connectNode`, `getBalance`, `sendTransaction`, `deployContract`, `callContract`, `stakeTokens`, `voteProposal`, `subscribeEvents`, `estimateGas`). Stake and vote use the signed-in browser session.
- JSON-RPC: `POST /api/rpc`. Chain reads and writes have no per-minute cap. GraphQL reads are `POST /api/graphql`.
- Live events: `GET /api/stream`.
- CLI: `npm run zendo -- status|fees|validators|balance <address>`.
- Sample HTTP clients: `sdk/kotlin/ZendoClient.kt` and `sdk/swift/ZendoClient.swift`.
- Chain parameters: `zendo-blockchain.toml`.

Contracts in the explorer are labeled chain accounts. There is no separate bytecode interpreter on the website ledger.

`/onboarding` is the new-user guide: wallet, phrase, PIN, an empty starting balance, a first send, staking, governance, and coin creation, plus referral codes, validator commission, spotlights, grants, and practice challenges. The same text is `docs/onboarding.md`. `/market` records a module name and summary for 1 Z. Each account can leave one rating from 1 to 5, and a later rating replaces the earlier one. Referral signups raise that author's listings on the board. `/learn` is a short guide to accounts, the curve, the node programs, and the SDK. Its lab quotes a live coin and does not send a trade. `/grants` files a milestone against the protocol treasury. Yes votes need 1,000 ZCoin. On a running node the payout waits 60 seconds. The engine test skips that wait. A paid grant moves Z from the treasury to the author and does not mint new supply.

## White paper

`docs/whitepaper-body.html` is the English source. Spanish, Chinese, Hindi, and Arabic sit beside it (`docs/whitepaper-es.html`, `whitepaper-zh.html`, `whitepaper-hi.html`, `whitepaper-ar.html`). The list is `docs/papers.json`. The site replaces `__VERSION__` with the version in `package.json`. `npm run whitepaper` writes each `public/whitepaper*.html` file and prints the matching PDF. Each PDF title is stamped with that version plus a hash of its own source. CI refuses a file whose stamp does not match, so a release bump or an edit has to reprint every language. The page is `/whitepaper`, with `?lang=es`, `zh`, `hi`, or `ar`. The explorer and the wallet embed the English HTML copy. `npm run zendo -- whitepaper` prints the links. The header, footer, wallet Docs link, and governance screen point at the page.

## Containers

```bash
docker compose up --build
```

The image listens on port 38471. `k8s/deployment.yaml` is a single replica of that image with a 1 GB claim mounted at `/app/data`, which is where the ledger and the session secret live. `Caddyfile` proxies `ZENDO_DOMAIN` (default `localhost`) to that port. `.github/workflows/ci.yml` runs tests, the white-paper version check, lint, and the production build.
