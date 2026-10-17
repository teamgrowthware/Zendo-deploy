"use client";

import { useState } from "react";

export function ContractCopy({ name, source }: { name: string; source: string }) {
  const [label, setLabel] = useState("Copy");

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setLabel("Copied");
    } catch {
      const area = document.getElementById(`src-${name}`) as HTMLTextAreaElement | null;
      if (!area) {
        setLabel("Copy failed");
        return;
      }
      area.focus();
      area.select();
      const ok = document.execCommand("copy");
      setLabel(ok ? "Copied" : "Copy failed");
    }
    window.setTimeout(() => setLabel("Copy"), 2000);
  }

  return (
    <section className="zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-panel zendo-p-4">
      <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-3">
        <h2 className="zendo-font-semibold">{name}</h2>
        <button
          type="button"
          onClick={copy}
          className="zendo-pointer zendo-inline-flex zendo-h-12 zendo-items-center zendo-justify-center zendo-rounded-full zendo-bg-gold zendo-px-5 zendo-text-base zendo-font-semibold zendo-text-ink"
        >
          {label}
        </button>
      </div>
      <textarea
        id={`src-${name}`}
        readOnly
        value={source}
        rows={18}
        className="zendo-mt-3 zendo-w-full zendo-resize-y zendo-rounded-2xl zendo-border zendo-border-line zendo-bg-ink zendo-p-3 zendo-font-mono zendo-text-xs zendo-leading-5 zendo-text-cream"
      />
    </section>
  );
}
