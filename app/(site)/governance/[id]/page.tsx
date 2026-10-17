import type { Metadata } from "next";
import { BackLink, PageIntro } from "@/components/chrome";
import { GovernDesk } from "@/components/app-views";

export const metadata: Metadata = { title: "Proposal" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-10">
      <BackLink href="/governance" label="Back to governance" />
      <PageIntro kicker="Governance" title="Proposal" body="Yes and no votes are weighed in ZCoin. Quorum is 1,000 Z. A passing vote writes one chain parameter." />
      <GovernDesk focusId={id} />
    </div>
  );
}
