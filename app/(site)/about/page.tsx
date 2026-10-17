import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/chrome";
import { CONTACT_EMAIL } from "@/lib/seed";

export const metadata: Metadata = { title: "About us" };

export default function Page() {
  return (
    <article className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-12">
      <PageIntro kicker="Company" title="About Zendo" body="Zendo is a persistent chain an operator runs on one machine: proof-of-stake blocks, a coin with a public supply, and a launchpad that does not ask the operator to hold user keys." />
      <div className="zendo-space-y-4 zendo-text-sm zendo-leading-7 zendo-text-muted">
        <p>The node keeps an append-only block log, a mempool, and a state commitment over account balances. Active validators take turns proposing. Blocks are treated as finalized after the depth in <span className="zendo-text-cream">zendo-blockchain.toml</span>. A shorter competing tip loses the fork-choice drill on the operator desk. Malformed headers are rejected and counted.</p>
        <p>ZendoCoin is the gas and governance asset. The ticker is $ZCoin. The base supply is one billion. Louis Conner, Co-founder and President, holds 200,000,000. Prabhat Agrawal holds 50,000,000. Pratyaksh Lutare holds 50,000,000. Those 300,000,000 stay in separate vesting locks. The other 700,000,000 is public and liquid, including the 100,000 system-wallet seed. The vesting clock is unset until this app is live online for public use. That first public visit records the date once, with no operator step. Nothing moves during the 120-day cliff after that date. Then the chain itself moves 25% of each founder allocation into that founder wallet at each anniversary for four years. Staking rewards are the only inflation, minted when a delegator claims.</p>
        <p>The launchpad sells new coins along a constant-product curve. A small fee splits between the creator and the protocol treasury. When real reserves cross the graduation line, the raised ZCoin and the remaining tokens seed a pool and later trades use that pool.</p>
        <p>Around that core are the things people actually touch: email and password, a 12-word recovery phrase, a 4-digit PIN, a web wallet, an explorer, governance votes, and an operator desk for validator approval and reports.</p>
        <p>There is no separate team page of invented biographies. The operator account is a published local login so you can open the desk. Change that password before a public host. Production hosting is your machine, a container, or the Kubernetes manifest in this repo. Reach the desk at {CONTACT_EMAIL}.</p>
        <p>Numbers for supply, the cliff, the curve, and fees are collected in the <Link href="/whitepaper" className="zendo-text-lime">white paper</Link>. A PDF of the same text is linked from the header and the footer.</p>
      </div>
    </article>
  );
}
