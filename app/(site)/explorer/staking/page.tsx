import type { Metadata } from "next";
import { validatorList } from "@/lib/engine";
import { PageIntro } from "@/components/chrome";
import { ExplorerNav, ValidatorTable } from "@/components/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staking" };

export default async function Page() {
  const rows = await validatorList();
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro title="Staking" body="Delegation is signed in from your wallet. This page is the public view of the set." />
      <ExplorerNav />
      <ValidatorTable rows={rows} stake />
    </div>
  );
}
