import type { Metadata } from "next";
import { PageIntro } from "@/components/chrome";
import { MarketDesk } from "@/components/market";

export const metadata: Metadata = { title: "Listing" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-10">
      <PageIntro kicker="Marketplace" title="Listing" body="One rating per account. Referral activity raises this listing in the board." />
      <MarketDesk focusId={id} />
    </div>
  );
}
