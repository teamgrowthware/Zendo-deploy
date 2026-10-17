"use client";

import Link from "next/link";
import { CopyButton } from "@/components/chrome";

export function CodeSample({ title, code, href, link }: { title: string; code: string; href: string; link: string }) {
  return (
    <div className="zendo-grid zendo-gap-2">
      <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-2">
        <p className="zendo-font-medium zendo-text-cream">{title}</p>
        <div className="zendo-flex zendo-items-center zendo-gap-3">
          <CopyButton value={code} label="Copy sample" />
          <Link href={href} className="zendo-text-sm zendo-text-lime">{link}</Link>
        </div>
      </div>
      <pre className="zendo-overflow-x-auto zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-panel zendo-p-4 zendo-text-xs zendo-text-cream">{code}</pre>
    </div>
  );
}
