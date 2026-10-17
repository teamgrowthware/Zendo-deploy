import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PageIntro } from "@/components/chrome";
import { LoadingPanel } from "@/components/ui";

const GovernDesk = dynamic(() => import("@/components/app-views").then((mod) => mod.GovernDesk), {
  loading: () => <LoadingPanel label="Loading proposals" />,
});

export const metadata: Metadata = { title: "Governance" };

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-10">
      <PageIntro mark="chain" kicker="Governance" title="Token-weighted votes" body="Your vote weighs your liquid ZCoin plus what you have delegated. Quorum is 1,000 ZCoin. A passing vote writes one chain parameter." />
      <p className="zendo-mb-6 zendo-text-sm zendo-text-muted">Proposal rules, quorum, and the fee schedule are written in the <Link href="/whitepaper" className="zendo-text-lime">white paper</Link> for this release.</p>
      <GovernDesk />
    </div>
  );
}
