import type { Metadata } from "next";
import { PageIntro } from "@/components/chrome";
import { FaqList } from "@/components/faq";

export const metadata: Metadata = { title: "FAQ" };

const ITEMS = [
  { q: "What is Zendo?", a: "The zendo-1 chain: a proof-of-stake block log, the ZendoCoin asset, and a bonding-curve launchpad. One process serves the website, the JSON-RPC endpoint, and the wallet APIs. The ledger is a SQLite database, data/zendo.sqlite, on that machine." },
  { q: "Where do I start?", a: "Open Onboarding. It walks through the wallet, the 12-word phrase, the PIN, a first send, staking, a vote, and creating a coin. New wallets start at 0 ZCoin. The same page explains referral codes, validator commission, coin promotion, treasury grants, and the practice challenges." },
  { q: "Is this a persistent chain?", a: "Yes. This process is the chain. Blocks, balances, stakes, votes, and parameter changes are stored in data/zendo.sqlite and kept across restarts. Balances are ledger entries. They are not dollars. The Polygon bridge locks ZendoCoin here and releases ERC-20 ZCOIN the bridge contract already holds. It does not mint a second supply and it does not pay a bank." },
  { q: "How do I cash out ZendoCoin?", a: "Open Bridge while signed in. A withdrawal locks the amount in the bridge vault, charges 0.001 Z, and shows a signed voucher. Submit that voucher with release() from your own Polygon wallet. You receive ERC-20 ZCOIN if the bridge contract holds it. That is not a dollar payout. A deposit asks for a Polygon transaction hash. This node reads the lock log and credits your znd1 address only when the vault has the coins." },
  { q: "Where do new users get ZCoin?", a: "They do not. The faucet is closed. A new wallet is created at 0 ZCoin. ZCoin arrives only by transfer, trade, staking rewards, a paid grant, or an existing balance such as the operator seed." },
  { q: "What is the 12-word phrase for?", a: "It derives the wallet address. The server stores only a hash. If you lose the phrase, nobody — including the operator — can restore that address. Finish PIN setup in the same sitting; the words are cleared from the server after you confirm them." },
  { q: "What does the PIN do?", a: "After the password, the session asks for 4 digits. Five wrong tries pause PIN entry for five minutes. The PIN is not a recovery method. The phrase is." },
  { q: "I forgot my password.", a: "Open Forgot Password. The reset link is shown on the next screen because there is no outbound mail server. It expires in 30 minutes. You still need your PIN to sign in. If you lost both, use Recover Account and the 12-word phrase." },
  { q: "How does a launchpad coin work?", a: "You pay a creation fee, the coin opens on a virtual curve, and buys and sells move the price. At the graduation reserve, unsold tokens and the ZCoin raised seed a pool. Creator fees accrue in ZCoin." },
  { q: "What are the fees?", a: "Transfers, trades, creation, promotion, staking, votes, and proposals each have a number in the config. The landing page lists the live schedule. Trade fees are a percentage; gas is a separate small ZCoin charge." },
  { q: "How does staking pay?", a: "You delegate at least 1 ZCoin to an active validator. Rewards accrue from the configured APR and the validator commission is skimmed when you claim. Unbonding waits a few blocks, then the ZCoin returns to your spendable balance." },
  { q: "How do votes get counted?", a: "Voting power is spendable ZCoin plus your delegations, snapshotted when you vote. A proposal needs more yes than no and at least 1,000 ZCoin cast to pass when the clock ends. Passing records the outcome. It does not silently edit the config." },
  { q: "Do you custody funds?", a: "No. There is no pooled user wallet. The faucet, treasury, vesting contract, and curve escrows are protocol accounts with published addresses, not a custodian holding customer deposits." },
  { q: "Does that mean no money-transmitter license is required?", a: "Not as a blanket claim. This software does not transmit fiat or hold user keys. A license can still apply if an operator adds custody, fiat payouts, or other regulated activity. That is a question for counsel in the operator's jurisdiction, not a feature of the repo." },
  { q: "Can I use it on a phone?", a: "Yes. Zendo is one responsive site on a phone, a tablet, and a desktop browser. On iPhone or iPad, open it in Safari and use Add to Home Screen. The manifest opens that icon in a standalone window. Optional shells in android/ and ios/ show that same site. The Android shell is a secure WebView. The iOS shell is WKWebView and is the project an App Store submission would use. An Android package cannot be sent to Apple. Apple still requires a developer membership, a privacy policy, and App Review, and it often rejects a site wrapped in a web view. The browser path does not wait on that review. An update to the node is the update on every device pointed at it." },
  { q: "How do I contact Zendo?", a: "Email zendo2026@proton.me. That is the only public address. Signed-in accounts can also open Support and file a ticket. Replies stay in the app. Zendo does not email them and there is no phone line." },
  { q: "How do search and social work?", a: "The search bar matches accounts, coins, blocks, transactions, addresses, and proposals as you type. Category filters work in the header and on a phone. Social lives at /app/social: follows, mutual friends, posts, 24-hour stories, video notes, circles, direct messages, and creator analytics. Those rows are stored in data/zendo.sqlite. They do not mint coins, and messages are not emailed." },
  { q: "Where is the white paper?", a: "Open White paper from the Company menu, or download the PDF from the footer. The same note is in English, Spanish, Chinese, Hindi, and Arabic. It is embedded on the explorer overview and inside the wallet under Resources. Its version matches package.json. Bump the version and run npm run whitepaper so every PDF stays in step. The CLI prints the links with npm run zendo -- whitepaper." },
];

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-12">
      <PageIntro kicker="Company" title="FAQ" body="Straight answers for the zendo-1 chain you are looking at." />
      <FaqList items={ITEMS} />
    </div>
  );
}
