import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { transaction } from "@/lib/engine";
import { ZendoError } from "@/lib/errors";
import { BackLink } from "@/components/chrome";
import { ExplorerNav, TxBody } from "@/components/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Transaction" };

export default async function Page({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  let data;
  try {
    data = await transaction(decodeURIComponent(hash));
  } catch (error) {
    if (error instanceof ZendoError && error.status === 404) notFound();
    throw error;
  }
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <ExplorerNav />
      <BackLink href="/explorer/txs" label="Back to transactions" />
      <h1 className="zendo-mb-4 zendo-font-display zendo-text-4xl zendo-font-bold">Transaction</h1>
      <TxBody tx={data.tx} blockHeight={data.block?.height ?? data.tx.height} />
    </div>
  );
}
