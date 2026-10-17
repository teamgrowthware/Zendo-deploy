import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PageIntro } from "@/components/chrome";
import { LoadingPanel } from "@/components/ui";

const MarketDesk = dynamic(() => import("@/components/market").then((mod) => mod.MarketDesk), {
  loading: () => <LoadingPanel label="Loading the marketplace" />,
});

export const metadata: Metadata = { title: "Marketplace" };

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro
        kicker="Marketplace"
        title="Modules and referral codes"
        body="Publish a contract, SDK, or app note. Ratings are one score per account. Referral totals count signups that used a code."
      />
      <MarketDesk />
    </div>
  );
}
