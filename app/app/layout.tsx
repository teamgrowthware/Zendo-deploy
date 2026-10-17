import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { sessionUser } from "@/lib/engine";
import { safeNext } from "@/lib/seed";
import { AppFrame } from "@/components/app-views";

export const dynamic = "force-dynamic";

export default async function WalletLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(safeNext((await headers()).get("x-zendo-path")))}`);
  return <AppFrame user={sessionUser(user)}>{children}</AppFrame>;
}
