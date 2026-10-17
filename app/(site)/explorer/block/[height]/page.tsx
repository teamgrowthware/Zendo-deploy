import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { block } from "@/lib/engine";
import { ZendoError } from "@/lib/errors";
import { BackLink } from "@/components/chrome";
import { ExplorerNav, BlockBody } from "@/components/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Block" };

export default async function Page({ params }: { params: Promise<{ height: string }> }) {
  const { height } = await params;
  let data;
  try {
    data = await block(Number(height));
  } catch (error) {
    if (error instanceof ZendoError && error.status === 404) notFound();
    throw error;
  }
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <ExplorerNav />
      <BackLink href="/explorer/blocks" label="Back to blocks" />
      <h1 className="zendo-mb-4 zendo-font-display zendo-text-4xl zendo-font-bold">Block {data.height}</h1>
      <BlockBody block={data} />
    </div>
  );
}
