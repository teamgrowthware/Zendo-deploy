import type { Metadata } from "next";
import { WalletHome } from "@/components/app-views";

export const metadata: Metadata = { title: "Wallet" };

export default function Page() {
  return <WalletHome />;
}
