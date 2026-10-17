# Zendo launch report

Version 0.9.0. Chain id `zendo-1`. This note describes the software in the repository. It is a compile and test record, not a security certificate, a store listing, or legal advice.

## What ships

One Next.js process is the chain. The ledger is `data/state.json` and stays on disk across restarts. Blocks are about 5 seconds apart and finalize after 2 blocks. A separate Rust binary, `zendo-node`, keeps its own ledger and is not the wallet the website uses.

New wallets start at 0 ZCoin. The faucet does not pay. Signup still creates a `znd1` address from a 12-word phrase and a 4-digit PIN.

## Zendo Cross-Platform Availability

Zendo is a responsive web application. The chain, the ZendoCoin wallet, the launchpad, the explorer, staking, governance, and the bridge are one site. That site is what runs on Android, on iOS, on tablets, and in current desktop browsers. Chrome, Safari, Firefox, and Edge open the same node. A phone scrolls the bottom bar across every signed-in destination. A wider window uses the header and the side navigation. The viewport uses the safe area, so a home-screen icon and a notched phone keep the bar above the system inset.

On iPhone and iPad, the public path is the mobile browser. In Safari, Add to Home Screen places Zendo on the home screen. The web app manifest sets `display` to `standalone`, with the Zendo name, the ink background, and the site icon. There is no service worker and no offline mode. The home-screen icon still needs the hosted node.

An update to the node is the update on every browser, every home-screen icon, and every wrapper pointed at that node. The shells do not keep a second ledger, so a chain fix does not wait on store review.

`android/` is an HTTPS-only WebView with cleartext off, file access off, and no JavaScript interface. Privacy opens `/privacy`. Play listing placeholders and the `bundlePlay` command are in `android/play/listing.txt`. The sideload keystore in the repo is not a Play upload key. Target API is 35.

`ios/` is an Xcode project, bundle id `app.zendo.ios`, using WKWebView only. App Transport Security does not allow arbitrary loads. The shell does not download executable code. Listing placeholders are in `ios/AppStore/metadata.txt`. Replace the placeholder icon and set `ZendoNodeURL` before you archive.

An Android package cannot be submitted to the Apple App Store. App Store distribution needs this iOS project, an Apple Developer Program membership, the privacy-policy URL, and App Review. Apple frequently rejects an app that is only a website inside a WebView. Safari and Add to Home Screen stay available if review says no.

### Where the extra app surfaces live

About, FAQ, Contact, Privacy, and Terms are `app/(site)/about/page.tsx`, `faq/page.tsx`, `contact/page.tsx`, `privacy/page.tsx`, and `terms/page.tsx`. Contact us is only `zendo2026@proton.me`.

Support tickets are `state.tickets` in the ledger, written by `lib/engine.ts` and served by `app/api/support/route.ts`. Statuses are open, in progress, resolved, and closed. Users open `/app/support`. Operators filter by status, category, user, and date, save desk notes, and reply on `/app/admin`. Replies render on the user’s ticket page. Desk notes do not. No email is sent.

Search suggestions and category filters use `GET /api/chain?view=suggest`. Results open the matching account, coin, block, transaction, address, or proposal. Social data is the same `data/state.json` file: follows, posts, stories, video notes, circles, and direct messages. Profiles are `/people/<id>`. The signed-in desk is `/app/social`. Stories expire after 24 hours. Video files are not stored. Direct messages stay in the app.

The same desk lists accounts with balances, stake, and voting power, sets the creator, moderator, or admin badge, and can pause an account without deleting it. It also lists meme coins, report reasons, promotion history, proposals, grants, live parameters, block height, `state.json` size, and the last recorded engine-test summary.

Download My History is the Settings control in `components/app-views.tsx`. It uses a short-lived pass and `/zendo-history/<pass>/zendo-history.json` or `.csv`, built by `historyFor`. The operator desk links `/ZendoL-1_App.zip`. `scripts/pack-public-zip.py` writes `downloads/ZendoL-1_App.zip` from `git ls-files`. `lib/phone-zip.ts` streams it with `Content-Disposition: attachment; filename=ZendoL-1_App.zip`, `application/zip`, and a full-file range as status 200 so Android’s Files app can open it.

Theme, text size, and contrast are local-storage preferences applied from `app/layout.tsx` and `app/globals.css`. Unknown routes use `app/not-found.tsx`. Render failures use `app/error.tsx` and `app/global-error.tsx`.

## Checks

Website tests: 9 passed. Rust tests: 21 passed. `npm run build` compiled and generated 37 routes. The white-paper page warns that reading the paper file traces the project. The request gate lives in `proxy.ts`. The build finishes. These checks are not a penetration test and they are not a finding that the software has no defects.

## Size

Tracked text is counted with newlines in git files, excluding binary PDFs, the favicon, the walkthrough video, and the phone zip. This report is included. The tree has 174 tracked files and 25,825 text lines: 11,014 lockfiles and the phrase list, 9,077 website, 4,118 Rust, 223 tests, 291 SDK and CLI, 747 docs and config, and 355 other text, plus five white-paper PDFs.

## Chain rules

Proof of stake rotates block production across active validators. Each validator has a commission. Delegating bonds ZCoin. The minimum stake is 1 ZCoin plus a 0.001 Z fee. Unbonding waits 2 blocks. Rewards are 8% a year before commission and are the only new coins. They mint when a delegator claims.

Jailing a validator slashes 10% of its self-stake and 10% of each delegation into the treasury, pauses rewards, and refuses new stake. A second jail does not slash again. The penalty is not returned.

ZendoCoin supply is 1,000,000,000 with 18 decimals. The ticker is $ZCoin. Founder vesting locks 300,000,000: Louis Conner, Co-founder and President, 200,000,000; Prabhat Agrawal 50,000,000; Pratyaksh Lutare 50,000,000. The public allocation is 700,000,000 and is liquid, including the 100,000 system-wallet seed and the grant treasury. The vesting clock is not set until the app is first served on a public HTTPS host. That date is stored once, with no operator step, then a 120-day cliff starts, and 25% of each founder allocation unlocks each year after that. Nothing unlocks on the cliff day. The chain moves unlocked coins into founder wallets on its own. The treasury pays grants. Coins written at first boot are the genesis allocation. They are stored once. After genesis the node does not invent trades. The Polygon mainnet contracts in `polygon/contracts` use the same numbers and refuse every chain except 137.

A proposal names one allowed parameter, costs 1 ZCoin, and needs 100 ZCoin of voting power. It passes with more yes than no and at least 1,000 ZCoin cast, then the next blocks use the new value. Supply, decimals, and vesting cannot be changed by a vote. Grants pay 1 to 5,000 ZCoin from the treasury. A marketplace listing costs 1 ZCoin and is a ledger transaction. Each address leaves one rating from 1 to 5.

The launchpad creates a coin for 0.2 ZCoin. Trades use a constant-product curve, pay 1% (0.30% creator, 0.70% protocol) plus gas, graduate at 85 ZCoin of real reserves, and can be promoted for 50 ZCoin for 24 hours.

## App surfaces

The header carries Launchpad, Explorer, ZCoin, Company, and Legal. Search accepts a block height, a transaction hash, a `znd1` address, or a ticker. Phone layouts use a menu and a bottom bar: Home, Launch, Send, Stake, Govern. The field is dark ink with lime and gold. Pointer styles are `zendo-pointer`, `zendo-default`, `zendo-text`, `zendo-move`, `zendo-wait`, and `zendo-not-allowed`.

Wallet screens cover receive, send, stake, claim, settings, support tickets, history download, and the referral link. The phone bar scrolls every signed-in destination. Governance, grants, marketplace, onboarding, learn, white paper, contact, and the operator desk are linked from the menus. The operator desk can answer tickets, download the project zip, approve or jail a validator, hide a reported coin, toggle the optional fee skim, grant premium RPC, and read reset links, contact notes, and the audit log. Regular wallets cannot open it.

## Clients and RPC

`lib/sdk.ts`, `sdk/kotlin/ZendoClient.kt`, and `sdk/swift/ZendoClient.swift` call the HTTP routes for status, balance, send, stake, propose, vote, grants, and listings. Signed calls use the browser session. Public JSON-RPC is `POST /api/rpc`. Chain reads and writes have no per-minute cap. The Rust RPC stays on localhost.

## White paper

`docs/whitepaper-body.html` is the English source. Spanish, Chinese, Hindi, and Arabic sit beside it. The site and the PDFs are version 0.9.0. Each PDF title carries that version and a hash of its source. The page is `/whitepaper`, with `?lang=es`, `zh`, `hi`, or `ar`.

The paper states the 1,000,000,000 supply, 18 decimals, closed faucet, operator seed, vesting, curve fee, graduation, promotion, governance parameters, grants, hashed phrase and PIN, secure cookies in production, rate-limited RPC, and the separate Rust node. It says there is no card processor and no fiat payout, and that it is not legal, financial, or investment advice.

## Hosting

Run `npm install` and `npm run dev` for local work on port 38471. `docker compose up --build` uses the same port and a volume for the ledger. Production sets secure cookies. A public request that is not HTTPS is refused. Health checks on localhost stay open. Put the included Caddyfile in front, change the seeded operator password, and keep `/app/data` on a disk that survives restarts.

A small virtual machine is enough: a Hetzner CX22 is about €4 to €6 a month, a 1 GB DigitalOcean or Linode droplet is about $6, Fly.io with a volume is about $5 to $8, or an always-free cloud VM when one is available. A domain is about $10 to $15 a year. A host that wipes the disk forgets every wallet.

Contact: zendo2026@proton.me.

## Phone package

`downloads/ZendoL-1_App.zip` is the public source archive. `scripts/pack-public-zip.py` rebuilds it from `git ls-files`. It includes the source tree, `bin/zendo-node`, the docs, the white papers, the bridge contracts, and the `android/` and `ios/` shells. The site serves it at `/ZendoL-1_App.zip` as `application/zip` with `Content-Disposition: attachment; filename=ZendoL-1_App.zip`. The operator desk, home page, and footer link that path. Extract it in the phone Files app, then copy the tree to the machine that will host the node.
