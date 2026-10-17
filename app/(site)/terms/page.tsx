import type { Metadata } from "next";
import { PageIntro } from "@/components/chrome";
import { CONTACT_EMAIL } from "@/lib/seed";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function Page() {
  return (
    <article className="zendo-mx-auto zendo-max-w-3xl zendo-space-y-4 zendo-px-4 zendo-py-12 zendo-text-sm zendo-leading-7 zendo-text-muted">
      <PageIntro kicker="Legal" title="Terms and conditions" body="These terms cover use of the Zendo software, including the site inside the Android and iOS wrappers." />
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">1. Acceptance</h2>
      <p>Creating an account, or continuing to use a node after reading this page, means you accept these terms. If you do not accept them, do not create an account.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">2. What the software is</h2>
      <p>Zendo gives you a wallet whose address comes from a 12-word phrase, native ZendoCoin, and a launchpad. Balances are ledger entries on the machine that runs the node. They are not dollars. The software does not custody fiat, intermediate a custodial balance, or send an off-chain payout. Nothing here is an invitation to buy or sell a security, commodity, or payment instrument. The Android and iOS shells only display this site. They do not add a second wallet.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">3. Your credentials</h2>
      <p>You are responsible for the recovery phrase, password, and PIN. If you lose the phrase, the address cannot be restored. If you share the phrase, anyone who has it can recover the account. Signing out clears the session on that browser or wrapper.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">4. Prohibited use</h2>
      <p>Do not use the launchpad to impersonate a project, run a scam, or upload illegal content. Do not upload an attachment that you do not have the right to share. Operators can hide a coin and jail a validator. Hiding a coin does not unwind trades already recorded.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">5. Fees, votes, and the bridge</h2>
      <p>Fees, emissions, and graduation thresholds start from the config file on the server you are using. A passing governance vote writes one allowed parameter into the ledger. A vote cannot change supply, decimals, or vesting. The Polygon bridge, when an operator configures it, locks ZendoCoin and releases ERC-20 already held by the bridge contract. It does not pay a bank.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">6. Support</h2>
      <p>Support tickets are messages stored on the node. A reply appears in the app. There is no support hotline and no promise of a response time. Public questions go to {CONTACT_EMAIL}.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">7. Warranty</h2>
      <p>The software is provided as-is, without warranty. Do not treat it as custody or investment advice. This page describes how the software moves native balances. It is not a determination that an operator is exempt from licensing. If you fork it and add real value, fiat rails, or custody, you are responsible for the licenses and disclosures that activity requires where you operate.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">8. Store listings</h2>
      <p>A store listing, if an operator submits one, is that operator’s submission. These terms are a practical notice for this codebase. They are not a substitute for a lawyer reviewing a production deployment, and they are not a statement that a store has approved the app.</p>
    </article>
  );
}
