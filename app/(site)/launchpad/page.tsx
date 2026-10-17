import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PageIntro } from "@/components/chrome";
import { LoadingPanel } from "@/components/ui";

const LaunchBoard = dynamic(() => import("@/components/launchpad").then((mod) => mod.LaunchBoard), {
  loading: () => <LoadingPanel label="Loading the launchpad" />,
});

export const metadata: Metadata = { title: "Launchpad" };

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro mark="coin" kicker="Launchpad" title="Coins on a curve" body="Create a ticker, trade it against ZCoin, and watch it graduate into a pool when the raise clears the line." />
      <LaunchBoard />
    </div>
  );
}
