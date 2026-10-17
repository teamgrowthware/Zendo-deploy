import { Suspense } from "react";
import type { Metadata } from "next";
import { SignInForm } from "@/components/auth";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense fallback={<p className="zendo-px-4 zendo-py-12 zendo-text-muted">Loading sign in…</p>}>
      <SignInForm />
    </Suspense>
  );
}
