import type { Metadata } from "next";
import { stats } from "@/lib/engine";
import { BrandMark, PageIntro } from "@/components/chrome";
import { ExplorerNav } from "@/components/explorer";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stats" };

export default async function Page() {
  const data = await stats();
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro title="Network stats" body={`Version ${data.status.version}. PoH ${data.status.poh ? "on" : "off"}.`} />
      <ExplorerNav />
      <div className="zendo-mb-4 zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-3">
        <BrandMark kind="coin" />
        <a href="/whitepaper" className="zendo-text-sm zendo-text-lime">Fees in the white paper</a>
      </div>
      <div className="zendo-grid zendo-gap-4 zendo-lg:zendo-grid-cols-2">
        <Panel>
          <Bars label="Recent slot gaps (ms)" values={data.blockTimes} />
        </Panel>
        <Panel>
          <Bars label="Gas per recent block" values={data.gas} />
        </Panel>
      </div>
      <Panel className="zendo-mt-4">
        <h2 className="zendo-font-semibold">Protocol revenue</h2>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Gas {data.revenue.gas} · trade {data.revenue.trade} · create {data.revenue.create} · promote {data.revenue.promote} · MEV slice {data.revenue.mev}</p>
      </Panel>
    </div>
  );
}

function Bars({ label, values }: { label: string; values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <p className="zendo-mb-3 zendo-text-sm zendo-text-muted">{label}</p>
      {values.length === 0 ? <p className="zendo-text-sm zendo-text-muted">Waiting for more blocks.</p> : null}
      <div className="zendo-flex zendo-h-28 zendo-items-end zendo-gap-1">
        {values.map((value, index) => (
          <div key={index} className="zendo-flex-1 zendo-rounded-t zendo-bg-lime/80" style={{ height: `${Math.max(4, (value / max) * 100)}%` }} title={String(value)} />
        ))}
      </div>
    </div>
  );
}
