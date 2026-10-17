import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/chrome";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Polygon bridge" };

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-12">
      <PageIntro
        kicker="Polygon"
        title="Zendo to Polygon bridge"
        body="A withdrawal locks ZendoCoin on this chain and signs a voucher for the Polygon bridge contract. A deposit reads a Polygon lock log and pays the same amount from the vault. The contract does not mint a second supply."
      />
      <div className="zendo-grid zendo-gap-4 zendo-text-sm zendo-leading-6 zendo-text-muted">
        <p>Set ZENDO_POLYGON_BRIDGE to the deployed contract and ZENDO_BRIDGE_PRIVATE_KEY to the signer before a withdrawal will lock coins. Deposits also need POLYGON_RPC_URL. Until those are set, balances stay in the wallet.</p>
        <p>After a voucher is signed, submit release(recipient, amount, nonce, signature) from your own Polygon wallet. That pays ERC-20 ZCOIN the bridge contract already holds. It does not send dollars.</p>
        <p>The signer key can authorize a release of whatever the Polygon contract holds. Keep that key on the node, mode 0600 or an environment variable, and do not log it.</p>
      </div>
      <div className="zendo-mt-6">
        <Button asChild><Link href="/app/bridge">Open the bridge</Link></Button>
      </div>
    </div>
  );
}
