import type { Metadata } from "next";
import { RecoverForm } from "@/components/auth";

export const metadata: Metadata = { title: "Recover account" };

export default function Page() {
  return <RecoverForm />;
}
