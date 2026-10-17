import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { sessionUser } from "@/lib/engine";
import { BackLink } from "@/components/chrome";
import { SettingsForm } from "@/components/app-views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/signin?next=/app/settings");
  return (
    <div>
      <BackLink href="/app" label="Back to the wallet" />
      <h1 className="zendo-mb-4 zendo-font-display zendo-text-4xl zendo-font-bold">Settings</h1>
      <SettingsForm user={sessionUser(user)} />
    </div>
  );
}
