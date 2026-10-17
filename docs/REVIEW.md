# Zendo chain review

Version 0.9.0. This note is a description of the software in the repository. It is not a store listing, a security certificate, or legal advice.

## What this package is

Zendo is one web app that runs the zendo-1 chain: a proof-of-stake block log, the ZendoCoin ledger, and a bonding-curve launchpad. Balances live in `data/state.json` on the machine that runs the site. The app does not hold a separate custodial wallet and it does not move fiat.

A Rust binary, `zendo-node`, is included beside the site. It keeps its own ledger. The website does not send wallet transfers through that binary.

Website tests passed (7 of 7). Rust tests passed (21 of 21). The production build compiled and generated 36 routes. The white-paper page warns that reading the paper file traces the project; the build still finishes. These checks are what this package records. They are not a penetration test, and they are not a finding that the software has no defects. There is no Android or iOS store binary in this archive.

## Size

165 tracked files, including this review. 25,264 lines of text, of which 11,014 are lockfiles and the 2,048-word phrase list. The rest is 8,567 lines of website code, 4,118 lines of Rust, 168 lines of tests, 197 lines of SDK and CLI samples, and 1,200 lines of docs and config, plus five white-paper PDFs.

## Accounts and wallet

Signup takes an email, a password of 8 to 72 characters with a letter and a number, and a display name. The address comes from a 12-word phrase. The server stores a hash of the phrase and then drops the words. A 4-digit PIN follows the password. Five wrong PINs pause entry for five minutes. Forgot password shows the reset link on screen because there is no mail server. Recover with the email and the 12 words replaces the password and the PIN.

New accounts receive 0 ZCoin. The faucet is closed. Older accounts keep the balance they already have. The wallet can show a QR code, send ZCoin or a launchpad token, stake, and claim rewards.

## Launchpad

Creating a coin costs 0.2 ZCoin. The creator names it, picks a ticker, and writes a short description. Price follows a constant-product curve. Each trade pays 1 percent, split 0.30 percent to the creator and 0.70 percent to the protocol, plus a small gas charge. At 85 ZCoin of real reserves the coin graduates into a pool. People can reply, vote the coin up or down, report it, and promote it for 50 ZCoin for 24 hours.

## Stake, governance, grants, and the directory

Staking pays 8 percent a year before validator commission. The minimum delegation is 1 ZCoin, and the fee is charged on top, so a brand-new 1 ZCoin grant cannot cover the first stake by itself. Unbonding waits two blocks.

A proposal costs 1 ZCoin and needs 100 ZCoin of voting power. It names one allowed parameter and lasts five days. A pass needs more yes than no and at least 1,000 ZCoin cast. Passing writes that parameter into the ledger. Supply, decimals, and vesting stay fixed.

Grants pay 1 to 5,000 ZCoin from the treasury after the same power check, a yes lead, and a short time lock. The payout does not mint new supply.

The marketplace lists a module note for 1 ZCoin. Each account can leave one rating from 1 to 5. Referral codes are counted on that page. A referred creator’s first coin gets a ranking boost. The software does not mint an extra reward for the invite. Practice challenges in the onboarding guide are a checklist. They do not pay a prize.

## Explorer, operator desk, and developers

The explorer shows blocks, transactions, addresses, validators, consensus, and stats. Search sits in the header. The operator desk can approve or jail a validator, read contact messages and reset links, hide a reported coin, grant premium RPC, and toggle an optional fee skim.

The TypeScript client can read balances, send, stake, and vote with the signed-in session. Kotlin and Swift samples call the same HTTP routes. The CLI prints status, fees, validators, a balance, and the white-paper links. JSON-RPC is rate limited. Live blocks stream from the site.

## Interface

The site uses a dark field, lime and gold accents, and the Syne and Outfit typefaces. The header carries the blue Zendo wordmark. ZendoCoin screens use the gold aperture mark. Explorer, governance, and the operator desk use the gold chain mark. Layouts adapt from a phone width to a desktop width. A bottom nav covers Home, Launch, Send, Stake, and Govern. The site can be installed as a web app from the browser. Company and Legal menus, the FAQ, onboarding, and the wallet link to the guide and the white paper.

Pointer styles are named `zendo-pointer`, `zendo-default`, `zendo-text`, `zendo-move`, `zendo-wait`, and `zendo-not-allowed`.

## White paper

`docs/whitepaper-body.html` is the English source. Spanish, Chinese, Hindi, and Arabic sit beside it. The site and the PDFs are version 0.9.0. Each PDF title is stamped with that version and a hash of its source. The page is `/whitepaper`, with `?lang=es`, `zh`, `hi`, or `ar`. The explorer and the wallet embed the English HTML copy.

The paper says balances live in this node's ledger, that new accounts receive 0 ZCoin, and that the operator seed starts at 100,000 ZCoin. Supply is 1,000,000,000 with 18 decimals. The ticker is $ZCoin. Founder locks are 300,000,000 and the public allocation is 700,000,000. Louis Conner is Co-founder and President. The vesting clock starts at public launch, then a 120-day cliff and 25 percent of each founder allocation each year. Nothing unlocks on the cliff day. Staking rewards are the only inflation. The launchpad section states the 0.2 ZCoin creation fee, the 1 percent trade fee, graduation at 85 ZCoin, and promotion at 50 ZCoin for 24 hours. Governance writes one allowed parameter when a vote passes. Grants pay from the treasury. Accounts use a hashed phrase and PIN. The Rust section describes gossip, fork choice, six programs, equivocation slashing, and unauthenticated localhost RPC. The closing section says there is no card processor and no fiat payout. The paper says it is not legal, financial, or investment advice.

## How to run and host

Install dependencies and run `npm run dev`. The site listens on port 38471. `docker compose up --build` uses the same port and a volume for the ledger. The Kubernetes manifest is one replica with a volume at `/app/data`. A serverless host that wipes the disk will forget wallets.

Before anyone else can reach a copy, change the seeded operator password, serve HTTPS, and set `ZENDO_SECURE_COOKIES=1`. A small virtual machine is enough for this single process. This archive does not include a public mainnet, a store binary, or a completed license review.

The phone archive is `ZendoL-1_App.zip`. Extract it in the Files app. A tap that only previews the archive needs Extract or Open with Files. `bin/zendo-node` is the validator binary inside the tree.

## Contact

zendo2026@proton.me
