import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetForm } from "@/components/auth";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return (
    <Suspense fallback={<p className="zendo-px-4 zendo-py-12 zendo-text-muted">Loading reset…</p>}>
      <ResetForm />
    </Suspense>
  );
}
