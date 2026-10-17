import type { Metadata } from "next";
import { PageIntro } from "@/components/chrome";
import { CONTACT_EMAIL } from "@/lib/seed";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Page() {
  return (
    <article className="zendo-mx-auto zendo-max-w-3xl zendo-space-y-4 zendo-px-4 zendo-py-12 zendo-text-sm zendo-leading-7 zendo-text-muted">
      <PageIntro kicker="Legal" title="Privacy policy" body="This policy describes the Zendo software in this repository. It is the privacy notice linked from the Android and iOS shells." />
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">1. Who this covers</h2>
      <p>This policy applies to the node you are using and to the web pages that node serves, including when those pages are opened in a browser, from a home-screen icon, or inside the Android or iOS wrapper. The wrapper does not keep a second copy of the ledger.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">2. Account data</h2>
      <p>Account records include your email, display name, password hash, PIN hash, and the hash of your recovery phrase. The phrase itself is held only until you confirm it during signup, then it is deleted. The operator cannot show it to you later.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">3. Ledger data</h2>
      <p>The node stores wallet addresses, balances, trades, votes, replies, reports, and password-reset links in a local data file. Reset links stay on screen because this build does not send email.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">4. Support tickets</h2>
      <p>A signed-in account can file a support ticket with a subject, a category, a description, and an optional attachment under 120 KB. Tickets and operator replies are stored in the same ledger file. Zendo does not email ticket updates. An operator account can read and answer tickets from the operator desk.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">5. History export</h2>
      <p>Settings can download your transactions, staking rows, governance activity, and meme-coin activity as JSON or CSV. That file is generated for the signed-in account. It is not sent to an outside address.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">6. Cookies and device settings</h2>
      <p>A session cookie keeps you signed in. It is HTTP-only. A short-lived cookie covers the PIN step. Referral codes in the URL are saved in your browser so signup can attach them. Display choices (theme, text size, contrast) stay in local storage on the device.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">7. Who can see it</h2>
      <p>Operator accounts can see the reset-link outbox, older contact notes, support tickets, and the audit log. Chain transfers are visible in the explorer the same way a public ledger is. The software does not sell data and does not include a third-party analytics SDK. Your host, reverse proxy, and browser will have their own logs.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">8. Retention</h2>
      <p>Closing an account means deleting the user row from the node data file. Chain history already written into blocks can remain.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">9. Contact</h2>
      <p>Questions about this policy: {CONTACT_EMAIL}.</p>
    </article>
  );
}
