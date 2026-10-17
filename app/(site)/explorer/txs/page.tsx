import type { Metadata } from "next";
import { transactionPage } from "@/lib/engine";
import { PageIntro } from "@/components/chrome";
import { ExplorerNav, Pager, TxTable } from "@/components/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Transactions" };

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const recent = await transactionPage(Number(query.page || "1"));
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro title="Transactions" body="Each row opens the transaction recorded on zendo-1." />
      <ExplorerNav />
      {recent.rows.length === 0 ? <p className="zendo-text-sm zendo-text-muted">No transactions yet.</p> : <TxTable txs={recent.rows} />}
      <Pager page={recent.page} pages={recent.pages} base="/explorer/txs" />
    </div>
  );
}
