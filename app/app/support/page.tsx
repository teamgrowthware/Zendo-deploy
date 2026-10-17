import type { Metadata } from "next";
import { BackLink } from "@/components/chrome";
import { SupportDesk } from "@/components/app-views";

export const metadata: Metadata = { title: "Support tickets" };

export default function Page() {
  return (
    <div>
      <BackLink href="/app" label="Back to the wallet" />
      <h1 className="zendo-mb-2 zendo-font-display zendo-text-4xl zendo-font-bold">Support tickets</h1>
      <p className="zendo-mb-4 zendo-max-w-2xl zendo-text-sm zendo-leading-6 zendo-text-muted">Open a ticket for this account. Operator replies appear here. Zendo does not email them.</p>
      <SupportDesk />
    </div>
  );
}
