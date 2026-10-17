import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/chrome";
import { LearnLab } from "@/components/learn-lab";

export const metadata: Metadata = { title: "Learn" };

const modules = [
  {
    title: "Accounts",
    body: "Signup stores a bcrypt password, a 12-word phrase, and a 4-digit PIN. The phrase is the recovery secret. The server keeps a hash, and the session is an httpOnly cookie.",
  },
  {
    title: "The curve",
    body: "A buy moves Z into the coin escrow and tokens out along a constant product. One percent is the fee. At 85 Z of real reserves the coin graduates into a pool. The lab below quotes that math on a live coin.",
  },
  {
    title: "The node",
    body: "The Rust process is a separate ledger. Its programs are a token, vesting, a curve, governance, an NFT, and an identity registry. CALL forwards one selector and one argument. Stake transactions go to the address that ends in 01.",
  },
  {
    title: "The SDK",
    body: "createZendoClient in lib/sdk.ts talks to this website. nodeCall, nodeStaking, and nodeGovernance talk to the local Rust RPC through POST /api/node. Kotlin and Swift samples call the same HTTP routes.",
  },
];

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-10">
      <PageIntro
        kicker="Learn"
        title="Guides for zendo-1"
        body="Four short modules for the software in this repo. The full walkthrough for a new wallet is on Onboarding. There is no certificate and no video course. The lab quotes a real coin."
      />
      <div className="zendo-grid zendo-gap-4">
        {modules.map((module, index) => (
          <article key={module.title} className="zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-panel/90 zendo-p-5">
            <p className="zendo-text-xs zendo-text-gold">Module {index + 1}</p>
            <h2 className="zendo-mt-1 zendo-font-semibold">{module.title}</h2>
            <p className="zendo-mt-2 zendo-text-sm zendo-leading-6 zendo-text-muted">{module.body}</p>
          </article>
        ))}
        <LearnLab />
        <p className="zendo-text-sm zendo-text-muted">
          The new-user walkthrough is on <Link href="/onboarding" className="zendo-text-lime">Onboarding</Link>. Grant votes and treasury payouts are on <Link href="/grants" className="zendo-text-lime">Grants</Link>. Contract selectors are on <Link href="/developers" className="zendo-text-lime">Developers</Link>.
        </p>
      </div>
    </div>
  );
}
