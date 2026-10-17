A new Zendo wallet starts on the zendo-1 chain you are looking at. Balances are ledger entries on this node. They are not dollars. Work through the sections in order the first time. Each one matches a screen you can open today.

## Create a wallet

Open Create a wallet from the header, or go to the signup page. Enter a display name of 2 to 32 characters, an email address, and a password of 8 to 72 characters that includes at least one letter and one number. Accept the terms and the privacy policy, then continue. If you arrived from an invite link, the site already stored that referral code and will attach it to this account.

The next screen shows twelve words. Those words are the recovery phrase for this address. Write them down, or download the text file, and keep that copy somewhere only you control. Tick the checkbox once the words are stored, then continue. The following screen asks for three of the words by position. Type them in the order requested. This check exists so the phrase leaves the screen with you. After the words match, choose a four-digit PIN on the pad. When the PIN is set, you are signed in and the wallet opens.

Sign-in later uses the same email and password, then the PIN. Five wrong PINs pause entry for five minutes. If you forget the password, open Forgot password. This chain has no mail server, so the reset link appears on the next screen and in the operator outbox. It expires in 30 minutes, and you still need the PIN. If you lose both the password and the PIN, open Recover, enter the email and the twelve words, and set a new password and PIN. That signs you in. If the words are gone, the address cannot be restored, including by the operator.

## Keep the recovery phrase safe

The twelve words derive the `znd1` address. The server stores a hash of the phrase and then drops the words after you confirm them. It does not keep a copy it can show you later. Treat the phrase like the only key to the wallet. Store it offline, away from the password and away from screenshots in a shared album. Anyone who has the words and the email can replace the password and the PIN.

The password opens the website session. The PIN is a second check on that session. Neither one replaces the phrase. Changing the password or the PIN from wallet settings does not change the phrase. A download of the words is convenient during signup and is also a file you should move off the device if other people can unlock it.

## Choose the PIN

The PIN is exactly four digits. Pick a number you can remember and that you do not reuse from a bank card or a phone lock you share. You will enter it after every password sign-in. The session cookie then stays signed in, and a shorter PIN cookie covers sensitive actions for a few minutes. Five misses lock PIN entry for five minutes. The lock is a pause, not a recovery method.

Set the PIN in the same sitting as the phrase. If you leave signup before the PIN step, start again. The words from an unfinished signup are cleared when that session expires.

## Start with an empty wallet

The faucet is closed. When the PIN is saved, the new address is written into a block with 0 ZCoin. There is no claim button and no signup grant. Accounts created before the faucet closed keep the balance they already had.

ZCoin has to arrive from another wallet, a trade, a staking reward, or a paid grant. A new empty wallet can sign in and read the explorer. It cannot pay a fee until it holds ZCoin. The faucet pool remains a protocol account. Signup does not draw from it.

## Send a first transaction

Open the wallet and copy your `znd1` address if you want someone to pay you. To send, open Send. Paste a recipient address, leave the token as ZCOIN, and enter an amount. The network fee is 0.001 ZCoin on top of the amount, paid in ZCoin. A first send of 0.1 ZCoin therefore spends 0.101 ZCoin. An address the node has never seen is labeled External wallet and can still receive the transfer.

Submit the form. The node debits your address, credits the recipient, and includes the transfer in a block. You land on the transaction page in the explorer, where the summary, fee, and addresses are visible. From there you can open either address and see the balance change. If the amount plus the fee is larger than your spendable ZCoin, the form stops and the balance stays as it was.

## Stake and claim rewards

Staking is how ZCoin earns the configured reward. Open Stake from the wallet or the bottom navigation. Each active validator shows a commission and a net APR. The base rate is 8 percent a year. The validator’s commission is skimmed from that reward when you claim, and the net APR on the card is what remains for you.

Delegate at least 1 ZCoin. The stake fee is 0.001 ZCoin in addition to the amount you delegate, so the wallet needs slightly more than 1 ZCoin of spendable balance. An empty new wallet cannot cover that. Receive ZCoin from another address before the first delegation.

After you delegate, the position appears on the same page. Rewards accrue over time and are minted when you press Claim. Full unstake pays accrued rewards in the same step. Unbonding waits two blocks, then the ZCoin returns to the spendable balance. Voting power is your spendable ZCoin plus the amount you still have delegated, so staking does not remove your voice.

## Vote and propose

Open Governance. A proposal shows its text, a yes share, and the time it ends. Active proposals accept Yes, No, or Abstain. Your weight is a snapshot of spendable ZCoin plus delegations at the moment you vote. The vote fee is 0.002 ZCoin. A new wallet can vote. Its weight is small until the balance grows.

A proposal names one live parameter, such as the trade fee or the block time. It passes when more ZCoin says yes than no and at least 1,000 ZCoin has been cast, after the five-day clock ends. Passing writes that parameter into the ledger. The next block uses it. A vote cannot change the 1,000,000,000 supply, the 18 decimals, or the vesting schedule. Opening a proposal costs 1 ZCoin and requires 100 ZCoin of voting power.

## Create a launchpad coin

Open Launchpad, then Create a coin. Choose a name, a ticker of 2 to 8 letters or numbers that starts with a letter, and a description of at least 10 characters. ZCOIN and ZENDO are reserved tickers. Pick an icon from the set. Creation costs 0.2 ZCoin, so the wallet has to hold that amount first.

The coin opens on a bonding curve. A buy pays ZCoin in, takes a 1 percent fee, and receives tokens. Of that fee, 0.30 percent of the trade goes to the creator and 0.70 percent goes to the protocol. Gas of 0.0005 ZCoin is charged on top. A sell returns ZCoin along the same curve, so you receive less than the pool price before the fee. When real reserves reach 85 ZCoin, the coin graduates into a pool. You can reply, vote the coin up or down, and report it from the coin page. Promotion is a separate paid spotlight, described with the other community programs below.

## Referral recognition

Every account has a referral code on the wallet and in settings. Copy the invite link and share it. When someone opens that link and finishes signup, the new account is counted under your code. The marketplace lists the codes with the most signups. That count is the live referral reward: public recognition on the board you are already helping to grow.

A referred account also receives a ranking boost on the first coin it creates, so an invite helps a new creator get seen. The software does not mint extra ZCoin for the referrer. If a community wants to pay inviters, an operator can fund that from a treasury grant after the signups are visible on the board. The count is what makes that decision auditable.

Referrals grow the chain because each new wallet is a new address that can trade, stake, and vote. The leaderboard gives existing members a reason to explain the product in their own words. Sustainability comes from keeping the reward inside the activity the chain already records, instead of inventing a second balance.

## Validator commission

Validators earn a commission on the staking rewards of the ZCoin delegated to them. The rate is on the stake card, and the net APR next to it is what delegators keep. Commission is the validator bonus on this chain. It is paid when a delegator claims, from the same reward mint, and it gives an operator a reason to keep a validator active and online.

Two seeded validators start as pending. An operator approves or jails validators from the admin desk. Users do not spin up a new validator from the wallet. Choosing a validator with a lower commission and a high uptime keeps more of the 8 percent with the delegator, and it directs stake toward operators who stay in the set. That choice is how the community funds the block producers without a separate bonus pool.

## Marketplace spotlights

The marketplace is where members publish a short note about a contract, an SDK, or an app. Publishing costs 1 ZCoin. Each account can leave one rating from 1 to 5, and a later rating replaces the earlier one. The page is a directory, not a bytecode deploy.

A spotlight is the Promote action on a coin you created. It costs 50 ZCoin and marks the coin Promoted for 24 hours. Promoted coins receive a large ranking boost on the launchpad, alongside volume, votes, and the referral boost. Creators use it when a launch deserves the top of the board. The fee is paid to the protocol, so the spotlight funds the same treasury that grants draw from.

Spotlights and listings keep the launchpad and the directory active. People return to rate, to trade what is featured, and to publish what they built. The fees are denominated in ZCoin that already exists, which is what keeps the program inside the supply instead of printing a marketing budget.

## Governance grants

Grants pay contributors from the protocol treasury. Open Grants, and file a title, a description of the work, a milestone name, and an amount from 1 to 5,000 ZCoin. You need 100 ZCoin of voting power, and the filing fee is 1 ZCoin. The treasury must already hold the amount you request.

Other accounts vote yes or no with their ZCoin weight. The grant can be paid after yes votes clear 1,000 ZCoin and the time lock has passed. On a running node that lock is 60 seconds. Paying moves ZCoin from the treasury to the author and does not mint new supply. The explorer records the payout.

Grants are how the community funds work that the faucet and the trade fees do not cover: documentation, meetups, and tools. They drive engagement because voters spend weight on a concrete milestone, and they stay sustainable because the ceiling is the treasury balance, not an open-ended mint.

## Practice challenges

These challenges are a way to learn the chain by doing. Complete them in any order after the wallet exists. The explorer, the wallet activity list, and the marketplace board are the record. The software does not mint a prize and does not keep a separate score.

Send 0.1 ZCoin to another address and open the transaction in the explorer. Create a coin and make one small buy so the chart has a trade. Delegate to an active validator once your balance covers 1 ZCoin plus the 0.001 fee, then claim after rewards appear. Vote on an open proposal or an open grant. Copy your invite link, and check the marketplace after someone uses it. Publish a module note, or promote a coin you created if the balance covers the fee.

Groups can run the list as a weekly thread and pay a standout entry with a treasury grant. That keeps the game inside governance. The growth comes from people who have actually sent, staked, voted, and launched, which is the usage this chain records. The sustainability comes from refusing an automatic prize mint that the supply schedule did not name.

## Host this chain for other people

Run one long-lived process and keep the ledger on disk. `npm run dev` serves the site at port 38471. `docker compose up --build` does the same, and the Kubernetes manifest mounts a volume at `/app/data`. A serverless host that wipes the filesystem will forget wallets on the next deploy.

Before anyone else can reach the node, change the seeded operator password, serve the site over HTTPS, and set `ZENDO_SECURE_COOKIES=1`. Password reset links stay on screen because there is no mail server. A small virtual machine is enough: a Hetzner CX22 is about €4 to €6 a month, a 1 GB DigitalOcean or Linode droplet is about $6, and a Fly.io shared machine with a volume is about $5 to $8. A domain is about $10 to $15 a year. Oracle’s always-free tier can be $0 when capacity is available. Put Caddy or another proxy in front, using the included Caddyfile, and point it at port 38471.

This repository is the chain and its docs. It does not include a store binary, and it does not claim that an operator is exempt from licensing. Read the terms and the white paper, and talk to counsel before treating a deployment as a live financial service.
