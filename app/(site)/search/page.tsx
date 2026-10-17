import type { Metadata } from "next";
import { BackLink, PageIntro } from "@/components/chrome";
import { SearchBox, SearchResults } from "@/components/search-box";

export const metadata: Metadata = { title: "Search" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const params = await searchParams;
  const q = params.q || "";
  const kind = params.kind || "all";
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-10">
      <BackLink href="/" label="Back home" />
      <PageIntro kicker="Search" title="Find anything on Zendo" body="Accounts, coins, blocks, transactions, addresses, and proposals. Suggestions update as you type." />
      <SearchBox key={`${q}:${kind}`} initialQuery={q} initialKind={kind} />
      <SearchResults q={q} kind={kind} />
    </div>
  );
}
