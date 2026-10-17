import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth";

export const metadata: Metadata = { title: "Create a wallet" };

export default function Page() {
  return <SignUpForm />;
}
