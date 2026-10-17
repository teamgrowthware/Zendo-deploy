import type { Metadata } from "next";
import { blockPage } from "@/lib/engine";
import { PageIntro } from "@/components/chrome";
import { BlockTable, ExplorerNav, Pager } from "@/components/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blocks" };

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const recent = await blockPage(Number(query.page || "1"));
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro title="Blocks" body={`${recent.total} blocks on zendo-1.`} />
      <ExplorerNav />
      {recent.rows.length === 0 ? <p className="zendo-text-sm zendo-text-muted">No blocks yet.</p> : <BlockTable blocks={recent.rows} />}
      <Pager page={recent.page} pages={recent.pages} base="/explorer/blocks" />
    </div>
  );
}
