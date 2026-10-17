import type { Metadata } from "next";
import { status } from "@/lib/engine";
import { PageIntro } from "@/components/chrome";
import { NodeConsensus } from "@/components/consensus";
import { ExplorerNav } from "@/components/explorer";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consensus" };

export default async function Page() {
  const chain = await status();
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro
        kicker="Consensus"
        title="Fork choice and peers"
        body="A longer valid chain replaces the tip when the shared ancestor is at or above the finalized height. Peers advertise their listen address and a short list of neighbors."
      />
      <ExplorerNav />
      <div className="zendo-mb-4 zendo-grid zendo-gap-3 zendo-sm:zendo-grid-cols-3">
        <Panel>
          <p className="zendo-text-xs zendo-text-muted">Website ledger height</p>
          <p className="num zendo-text-2xl zendo-font-semibold">{chain.height}</p>
          <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Finalized through {chain.finalizedHeight}. This file is separate from the Rust node.</p>
        </Panel>
        <Panel>
          <p className="zendo-text-xs zendo-text-muted">Finality depth</p>
          <p className="num zendo-text-2xl zendo-font-semibold">{chain.height - chain.finalizedHeight}</p>
          <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Blocks at or below the finalized height are not reorged.</p>
        </Panel>
        <Panel>
          <p className="zendo-text-xs zendo-text-muted">Slot target</p>
          <p className="num zendo-text-2xl zendo-font-semibold">{chain.blockTimeMs} ms</p>
          <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Recent average {chain.avgBlockMs} ms on the website ledger.</p>
        </Panel>
      </div>
      <NodeConsensus />
      <Panel className="zendo-mt-4">
        <h2 className="zendo-font-semibold">How a fork is resolved</h2>
        <ol className="zendo-mt-3 zendo-list-decimal zendo-space-y-2 zendo-pl-5 zendo-text-sm zendo-leading-6 zendo-text-muted">
          <li>A block that does not extend the tip is kept aside if its proposer signature and slot match.</li>
          <li>Blocks may arrive out of order. They apply once the missing parents show up.</li>
          <li>The heavier chain is the one with the greater height that still links to this genesis.</li>
          <li>If that chain forks at or below the finalized height, the node keeps its current tip and leaves the side blocks stored.</li>
          <li>Otherwise it replays the heavier chain, writes the new history, and counts a reorg.</li>
        </ol>
      </Panel>
    </div>
  );
}
