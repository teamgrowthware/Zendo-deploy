import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return <ForgotForm />;
}
