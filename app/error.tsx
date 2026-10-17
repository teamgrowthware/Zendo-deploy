"use client";

import { Logo } from "@/components/chrome";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="zendo-mx-auto zendo-max-w-lg zendo-px-4 zendo-py-20">
      <Logo />
      <h1 className="zendo-mt-6 zendo-font-display zendo-text-4xl zendo-font-bold">Something went wrong</h1>
      <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">{error.message || "This screen hit an error. Your balances were not changed by the failed page."}</p>
      <button className="zendo-mt-6 zendo-rounded-full zendo-bg-lime zendo-px-4 zendo-py-2 zendo-font-semibold zendo-text-ink" onClick={reset}>Try again</button>
    </div>
  );
}
