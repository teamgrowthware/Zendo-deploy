import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/chrome";

export const metadata: Metadata = { title: "Cross-platform" };

export default function Page() {
  return (
    <article className="zendo-mx-auto zendo-max-w-3xl zendo-space-y-4 zendo-px-4 zendo-py-12 zendo-text-sm zendo-leading-7 zendo-text-muted">
      <PageIntro kicker="Zendo documentation" title="Zendo cross-platform availability" body="One site is the wallet, the chain, and the launchpad. Browsers, home-screen icons, and the native shells all open that site." />
      <p>Chrome, Safari, Firefox, and Edge use the same node. A phone scrolls the signed-in bar. A wider window uses the header and the side navigation. The viewport includes the safe area.</p>
      <p>On iPhone and iPad, open the site in Safari and use Add to Home Screen. The optional projects in <span className="zendo-text-cream">android/</span> and <span className="zendo-text-cream">ios/</span> only display the site. They do not keep a second ledger. An update on the host is the update in every client pointed at that host.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">Google Play</h2>
      <p>Host the site on HTTPS. Build <span className="zendo-text-cream">android/</span> with an upload key that is not the sideload keystore, set the node URL, and upload the bundle from Play Console. The privacy URL is <span className="zendo-text-cream">/privacy</span>. Play review is Google’s decision.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">Apple App Store</h2>
      <p>Open <span className="zendo-text-cream">ios/Zendo.xcodeproj</span> on a Mac, set the node URL, replace the placeholder icon, and archive. The shell is WKWebView only, with arbitrary loads left off. Apple often rejects an app that is only a website in a web view. Safari and Add to Home Screen stay available if review says no.</p>
      <h2 className="zendo-font-display zendo-text-xl zendo-font-bold zendo-text-cream">Where features live</h2>
      <p><Link className="zendo-text-lime" href="/about">About</Link>, <Link className="zendo-text-lime" href="/contact">Contact</Link>, <Link className="zendo-text-lime" href="/faq">FAQ</Link>, <Link className="zendo-text-lime" href="/privacy">Privacy</Link>, and <Link className="zendo-text-lime" href="/terms">Terms</Link> are standalone routes. Support tickets are on <Link className="zendo-text-lime" href="/app/support">Support</Link>. History download is on <Link className="zendo-text-lime" href="/app/settings">Settings</Link>. The operator desk links <Link className="zendo-text-lime" href="/ZendoL-1_App.zip">ZendoL-1_App.zip</Link>.</p>
      <p>The archive is rebuilt by <span className="zendo-text-cream">scripts/pack-public-zip.py</span> from the tracked tree and served as <span className="zendo-text-cream">application/zip</span> with the filename unquoted. A range that covers the whole file returns 200.</p>
    </article>
  );
}
