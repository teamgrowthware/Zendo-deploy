import type { Metadata } from "next";
import { BackLink } from "@/components/chrome";
import { BridgeDesk } from "@/components/app-views";

export const metadata: Metadata = { title: "Bridge" };

export default function Page() {
  return (
    <div>
      <BackLink href="/app" label="Back to the wallet" />
      <h1 className="zendo-mb-2 zendo-font-display zendo-text-4xl zendo-font-bold">Bridge</h1>
      <p className="zendo-mb-4 zendo-max-w-2xl zendo-text-sm zendo-leading-6 zendo-text-muted">
        Withdraw locks ZendoCoin in the bridge vault and signs a Polygon voucher. Deposit credits this wallet only after Polygon shows a lock for this znd1 address, and only up to the coins already in the vault. The voucher is not a bank payout.
      </p>
      <BridgeDesk />
    </div>
  );
}
