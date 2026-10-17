import type { Metadata } from "next";
import { BackLink } from "@/components/chrome";
import { StakeDesk } from "@/components/app-views";

export const metadata: Metadata = { title: "Stake" };

export default function Page() {
  return (
    <div>
      <BackLink href="/app" label="Back to the wallet" />
      <h1 className="zendo-mb-2 zendo-font-display zendo-text-4xl zendo-font-bold">Stake</h1>
      <p className="zendo-mb-4 zendo-max-w-2xl zendo-text-sm zendo-leading-6 zendo-text-muted">Delegate ZCoin to an active validator. Rewards come from inflation, skimmed by that validator&apos;s commission. Unbonding waits for the depth in the config file.</p>
      <StakeDesk />
    </div>
  );
}
