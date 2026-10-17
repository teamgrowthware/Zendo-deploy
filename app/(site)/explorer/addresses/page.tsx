import type { Metadata } from "next";
import Link from "next/link";
import { accountPage } from "@/lib/engine";
import { shortAddr } from "@/lib/format";
import { PageIntro } from "@/components/chrome";
import { ExplorerNav, Pager } from "@/components/explorer";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Addresses" };

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const recent = await accountPage(Number(query.page || "1"));
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro title="Addresses" body="Accounts on this chain. Open one for balances and its transactions." />
      <ExplorerNav />
      <div className="zendo-grid zendo-gap-2">
        {recent.rows.length === 0 ? <p className="zendo-text-sm zendo-text-muted">No addresses yet.</p> : null}
        {recent.rows.map((row) => (
          <Panel key={row.address}>
            <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-3 zendo-text-sm">
              <div>
                <Link href={`/explorer/address/${row.address}`} className="zendo-font-semibold zendo-text-lime">{row.name}</Link>
                <p className="zendo-mt-1 zendo-font-mono zendo-text-xs zendo-text-muted">{shortAddr(row.address)}</p>
              </div>
              <span className="num">{row.zcoin} Z</span>
            </div>
          </Panel>
        ))}
      </div>
      <Pager page={recent.page} pages={recent.pages} base="/explorer/addresses" />
    </div>
  );
}
