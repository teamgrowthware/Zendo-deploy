import type { Metadata } from "next";
import { BackLink } from "@/components/chrome";
import { CoinScreen } from "@/components/launchpad";

export const metadata: Metadata = { title: "Coin" };

export default async function Page({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-8">
      <BackLink href="/launchpad" label="Back to the launchpad" />
      <CoinScreen mint={mint} />
    </div>
  );
}
