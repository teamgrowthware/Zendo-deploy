import type { Metadata } from "next";
import { PageIntro } from "@/components/chrome";
import { CreateCoinForm } from "@/components/launchpad";

export const metadata: Metadata = { title: "Create a coin" };

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-10">
      <PageIntro mark="coin" kicker="Launchpad" title="Create a coin" body="The ticker is unique. You pay the creation fee from your wallet. You do not receive the supply. Buyers do, along the curve." />
      <CreateCoinForm />
    </div>
  );
}
