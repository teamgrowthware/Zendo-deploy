import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { address } from "@/lib/engine";
import { ZendoError } from "@/lib/errors";
import { BackLink } from "@/components/chrome";
import { AddressBody, ExplorerNav } from "@/components/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Address" };

export default async function Page({ params }: { params: Promise<{ address: string }> }) {
  const { address: id } = await params;
  let data;
  try {
    data = await address(decodeURIComponent(id));
  } catch (error) {
    if (error instanceof ZendoError && error.status === 404) notFound();
    throw error;
  }
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <ExplorerNav />
      <BackLink href="/explorer/addresses" label="Back to addresses" />
      <AddressBody data={data} />
    </div>
  );
}
