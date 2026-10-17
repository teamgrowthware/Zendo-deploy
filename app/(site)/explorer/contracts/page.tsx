import type { Metadata } from "next";
import Link from "next/link";
import { contractList } from "@/lib/engine";
import { PageIntro } from "@/components/chrome";
import { ExplorerNav } from "@/components/explorer";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contracts" };

export default async function Page() {
  const rows = await contractList();
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro title="Contracts" body="ZendoCoin, vesting, the launchpad, governance, and every coin. These are chain accounts with a role, not opaque bytecode." />
      <ExplorerNav />
      <div className="zendo-grid zendo-gap-3">
        {rows.map((row) => (
          <Panel key={row.address + row.name}>
            <p className="zendo-text-xs zendo-uppercase zendo-tracking-wide zendo-text-muted">{row.kind}</p>
            <h2 className="zendo-font-semibold">{row.name}</h2>
            <p className="zendo-text-sm zendo-text-muted">{row.detail}</p>
            {row.address.startsWith("znd1") ? <Link className="zendo-text-xs zendo-text-lime" href={row.kind === "curve" || row.kind === "pool" ? `/launchpad/${row.address}` : `/explorer/address/${row.address}`}>{row.address}</Link> : null}
          </Panel>
        ))}
      </div>
    </div>
  );
}
