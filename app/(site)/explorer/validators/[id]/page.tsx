import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { validatorList } from "@/lib/engine";
import { BackLink, PageIntro } from "@/components/chrome";
import { ExplorerNav } from "@/components/explorer";
import { Badge, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Validator" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await validatorList();
  const validator = rows.find((row) => row.id === id);
  if (!validator) notFound();
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-10">
      <BackLink href="/explorer/validators" label="Back to validators" />
      <PageIntro title={validator.moniker} body="Validator on zendo-1. Commission is taken from staking rewards when a delegator claims." />
      <ExplorerNav />
      <Panel className="zendo-grid zendo-gap-2 zendo-text-sm">
        <div className="zendo-flex zendo-items-center zendo-gap-2">
          <Badge tone={validator.status === "active" ? "lime" : validator.status === "jailed" ? "coral" : "gold"}>{validator.status}</Badge>
          <span className="zendo-text-muted">{validator.region}</span>
        </div>
        <p>Commission {validator.commission}% · uptime {validator.uptime}% · net APR {validator.apr}%</p>
        <p>Self stake {validator.selfStake} Z · delegated {validator.delegated} Z · blocks proposed {validator.proposed}</p>
        <p className="zendo-break-all zendo-font-mono zendo-text-xs zendo-text-muted">{validator.address}</p>
        <div className="zendo-mt-2 zendo-flex zendo-flex-wrap zendo-gap-4">
          <Link href={`/explorer/address/${validator.address}`} className="zendo-text-lime">Address</Link>
          <Link href="/app/stake" className="zendo-text-lime">Stake</Link>
          <Link href="/app/admin" className="zendo-text-lime">Operator desk</Link>
        </div>
      </Panel>
    </div>
  );
}
