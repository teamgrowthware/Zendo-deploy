import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { BackLink } from "@/components/chrome";
import { LoadingPanel } from "@/components/ui";

const AdminDesk = dynamic(() => import("@/components/app-views").then((mod) => mod.AdminDesk), {
  loading: () => <LoadingPanel label="Loading the operator desk" />,
});

export const metadata: Metadata = { title: "Operator desk" };

export default function Page() {
  return (
    <div>
      <BackLink href="/app" label="Back to the wallet" />
      <h1 className="zendo-mb-2 zendo-font-display zendo-text-4xl zendo-font-bold">Operator desk</h1>
      <p className="zendo-mb-4 zendo-max-w-2xl zendo-text-sm zendo-leading-6 zendo-text-muted">Node health, support tickets, the project zip, validator approval, coin reports, and the reset-link outbox. Regular wallets cannot open this.</p>
      <AdminDesk />
    </div>
  );
}
