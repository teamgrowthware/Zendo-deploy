import type { Metadata } from "next";
import { PageIntro } from "@/components/chrome";
import { externalCatalog } from "@/lib/engine";

export const metadata: Metadata = { title: "External assets" };

export default async function Page() {
  const catalog = await externalCatalog();
  return (
    <div>
      <PageIntro kicker="Synthetics" title="External assets" body="Zendo records wrapped balances only after two independent read-only sources agree. You sign any external lock or burn in your own wallet. Zendo does not store that key and does not send the transaction." />
      <p className="zendo-text-sm zendo-text-muted">{catalog.count.toLocaleString()} assets are loaded from the registry across {catalog.chains.join(", ")}. Adding another asset is a config or operator registration, not a code change.</p>
      <p className="zendo-mt-4 zendo-text-sm">Oracle events ingested: {catalog.metrics.ingested}. Minted: {catalog.metrics.minted}. Burned: {catalog.metrics.burned}. Quarantined: {catalog.metrics.quarantined}.</p>
      <p className="zendo-mt-6 zendo-text-sm zendo-leading-6">Trade, launch, boost, listing, and governance fees settle in ZendoCoin or a synthetic balance on this ledger. They are protocol accounting entries. They are not a transfer of coins on Ethereum, Solana, or any other network.</p>
    </div>
  );
}
