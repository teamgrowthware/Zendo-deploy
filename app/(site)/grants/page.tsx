import type { Metadata } from "next";
import { PageIntro } from "@/components/chrome";
import { GrantsDesk } from "@/components/grants";

export const metadata: Metadata = { title: "Grants" };

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-10">
      <PageIntro
        kicker="Grants"
        title="Treasury votes"
        body="File a milestone, collect yes votes, and pay the author from the protocol treasury. The payout is a ledger transaction."
      />
      <GrantsDesk />
    </div>
  );
}
