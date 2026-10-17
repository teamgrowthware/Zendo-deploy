import type { Metadata } from "next";
import { blocks, status } from "@/lib/engine";
import { PageIntro, PaperFrame } from "@/components/chrome";
import { BlockTable, ExplorerNav } from "@/components/explorer";
import { SearchBox } from "@/components/search-box";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explorer" };

export default async function Page() {
  const [chain, recent] = await Promise.all([status(), blocks(8)]);
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro kicker="Explorer" title="zendo-1" body={`${chain.chainName} · finalized through ${chain.finalizedHeight} · average slot ${chain.avgBlockMs} ms.`} />
      <ExplorerNav />
      <SearchBox />
      <div className="zendo-mb-4 zendo-grid zendo-gap-3 zendo-sm:zendo-grid-cols-4">
        {[
          ["Height", chain.height],
          ["TPS", chain.tps],
          ["Accounts", chain.accounts],
          ["Peers", chain.peers],
        ].map(([k, v]) => (
          <Panel key={String(k)}>
            <p className="zendo-text-xs zendo-text-muted">{k}</p>
            <p className="num zendo-text-2xl zendo-font-semibold">{v}</p>
          </Panel>
        ))}
      </div>
      <BlockTable blocks={recent} />
      <div className="zendo-mt-8"><PaperFrame /></div>
    </div>
  );
}
