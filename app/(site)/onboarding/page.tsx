import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageIntro } from "@/components/chrome";

export const metadata: Metadata = { title: "Onboarding" };

function inline(text: string): ReactNode[] {
  const chunks = text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return chunks.map((chunk, index) => {
    const code = chunk.match(/^`([^`]+)`$/);
    if (code) return <code key={index} className="zendo-text-cream">{code[1]}</code>;
    const link = chunk.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = link[2];
      if (href.startsWith("/")) return <Link key={index} href={href} className="zendo-text-lime">{link[1]}</Link>;
      return <a key={index} href={href} className="zendo-text-lime">{link[1]}</a>;
    }
    return chunk;
  });
}

function Guide({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\n+/);
  return (
    <div className="zendo-grid zendo-gap-4">
      {blocks.map((block) => {
        if (block.startsWith("### ")) {
          return <h3 key={block} className="zendo-mt-4 zendo-font-display zendo-text-xl zendo-font-bold">{inline(block.slice(4))}</h3>;
        }
        if (block.startsWith("## ")) {
          return <h2 key={block} className="zendo-mt-8 zendo-font-display zendo-text-2xl zendo-font-bold">{inline(block.slice(3))}</h2>;
        }
        return <p key={block} className="zendo-text-sm zendo-leading-7 zendo-text-muted">{inline(block)}</p>;
      })}
    </div>
  );
}

export default function Page() {
  const source = readFileSync(path.join(process.cwd(), "docs/onboarding.md"), "utf8");
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-12">
      <PageIntro
        kicker="Start here"
        title="Onboarding"
        body="Create a wallet at 0 ZCoin, then receive coins, stake, vote, and launch. Passed votes write chain parameters. Referrals, commission, spotlights, and grants stay on the ledger."
      />
      <Guide source={source} />
    </div>
  );
}
