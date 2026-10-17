import type { Metadata } from "next";
import { validatorList } from "@/lib/engine";
import { PageIntro } from "@/components/chrome";
import { ExplorerNav, ValidatorTable } from "@/components/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Validators" };

export default async function Page() {
  const rows = await validatorList();
  return (
    <div className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
      <PageIntro title="Validators" body="Pending validators sit out of the proposer set until an operator approves them." />
      <ExplorerNav />
      <ValidatorTable rows={rows} />
    </div>
  );
}
