"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/sdk";
import type { SearchHit, SearchKind, SuggestView } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Input } from "./ui";

const FILTERS: { id: "all" | SearchKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "user", label: "Users" },
  { id: "coin", label: "Coins" },
  { id: "block", label: "Blocks" },
  { id: "transaction", label: "Transactions" },
  { id: "address", label: "Addresses" },
  { id: "proposal", label: "Proposals" },
];

function kindOf(value: string | undefined): "all" | SearchKind {
  return FILTERS.some((item) => item.id === value) ? (value as "all" | SearchKind) : "all";
}

export function SearchBox({
  compact = false,
  initialQuery = "",
  initialKind = "all",
}: {
  compact?: boolean;
  initialQuery?: string;
  initialKind?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [kind, setKind] = useState(kindOf(initialKind));
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [exact, setExact] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    let stop = false;
    const handle = setTimeout(() => {
      api<SuggestView>(`/api/chain?view=suggest&q=${encodeURIComponent(query)}&kind=${kind}&limit=8`)
        .then((data) => {
          if (stop) return;
          setHits(data.hits);
          setExact(data.exact?.href || null);
          setError(null);
          setOpen(true);
        })
        .catch((err) => {
          if (!stop) setError(err instanceof Error ? err.message : "Search failed.");
        });
    }, 180);
    return () => {
      stop = true;
      clearTimeout(handle);
    };
  }, [q, kind]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const panel = open && q.trim() ? (
    <div className={cn("zendo-suggest-panel zendo-rounded-2xl zendo-border zendo-border-line zendo-bg-ink zendo-p-2 zendo-shadow-2xl", compact ? "zendo-suggest-panel-end" : "zendo-suggest-panel-start")} role="listbox" aria-label="Suggestions">
      <FilterRow kind={kind} onChange={setKind} />
      {hits.length === 0 ? <p className="zendo-px-2 zendo-py-3 zendo-text-sm zendo-text-muted">No suggestions for that filter.</p> : null}
      <div className="zendo-grid">
        {hits.map((hit) => (
          <button key={`${hit.kind}:${hit.href}:${hit.title}`} type="button" className="zendo-pointer zendo-rounded-xl zendo-px-2 zendo-py-2 zendo-text-left hover:zendo-bg-white/5" onMouseDown={(event) => event.preventDefault()} onClick={() => go(hit.href)}>
            <span className="zendo-block zendo-text-sm zendo-text-cream">{hit.title}</span>
            <span className="zendo-block zendo-truncate zendo-text-xs zendo-text-muted">{hit.detail} · {labelFor(hit.kind)}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <form
      className={compact ? "zendo-relative zendo-min-w-0" : "zendo-relative zendo-mb-4"}
      role="search"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const query = q.trim();
        if (!query) {
          setError("Type a name, ticker, height, hash, or address.");
          return;
        }
        try {
          const data = await api<SuggestView>(`/api/chain?view=suggest&q=${encodeURIComponent(query)}&kind=${kind}&limit=8`);
          if (kind === "all" && data.exact?.href) {
            go(data.exact.href);
            return;
          }
          if (data.hits.length === 1) {
            go(data.hits[0].href);
            return;
          }
          setOpen(false);
          router.push(`/search?q=${encodeURIComponent(query)}&kind=${kind}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Search failed.");
        }
      }}
    >
      {compact ? null : <FilterRow kind={kind} onChange={setKind} />}
      <Input
        aria-label="Search Zendo"
        aria-expanded={open}
        autoComplete="off"
        className={compact ? "zendo-h-9" : undefined}
        placeholder={compact ? "Search" : "Users, coins, blocks, transactions, addresses, proposals"}
        value={q}
        onFocus={() => {
          if (q.trim()) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => setQ(event.target.value)}
      />
      {panel}
      {error ? <p className="zendo-mt-2 zendo-text-sm zendo-text-coral">{error}</p> : null}
      {exact && !compact && kind === "all" ? <p className="zendo-mt-2 zendo-text-xs zendo-text-muted">Exact match opens that page.</p> : null}
    </form>
  );
}

function FilterRow({ kind, onChange }: { kind: "all" | SearchKind; onChange: (kind: "all" | SearchKind) => void }) {
  return (
    <div className="zendo-mb-2 zendo-flex zendo-flex-wrap zendo-gap-1" role="group" aria-label="Search categories">
      {FILTERS.map((filter) => {
        const active = kind === filter.id;
        return (
          <button
            key={filter.id}
            type="button"
            aria-pressed={active}
            className={cn("zendo-pointer zendo-rounded-full zendo-px-2 zendo-py-1 zendo-text-xs", active ? "zendo-bg-lime zendo-text-ink" : "zendo-border zendo-border-line zendo-text-muted")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(filter.id)}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

function labelFor(kind: SearchKind) {
  return FILTERS.find((item) => item.id === kind)?.label || kind;
}

export function SearchResults({ q, kind }: { q: string; kind: string }) {
  const router = useRouter();
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filter = kindOf(kind);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    let stop = false;
    api<SuggestView>(`/api/chain?view=suggest&q=${encodeURIComponent(query)}&kind=${filter}&limit=24`)
      .then((data) => {
        if (!stop) setHits(data.hits);
      })
      .catch((err) => {
        if (!stop) setError(err instanceof Error ? err.message : "Search failed.");
      });
    return () => {
      stop = true;
    };
  }, [q, filter]);

  if (error) return <p className="zendo-text-sm zendo-text-coral">{error}</p>;
  if (!q.trim()) return <p className="zendo-text-sm zendo-text-muted">Type in the search bar to look across accounts, coins, and the chain.</p>;
  if (!hits) return <p className="zendo-text-sm zendo-text-muted" role="status">Looking through the ledger…</p>;
  if (hits.length === 0) return <p className="zendo-text-sm zendo-text-muted">Nothing matches that category.</p>;
  return (
    <div className="zendo-grid zendo-gap-2">
      {hits.map((hit) => (
        <button key={`${hit.kind}:${hit.href}:${hit.title}`} type="button" className="zendo-pointer zendo-rounded-2xl zendo-border zendo-border-line zendo-bg-panel zendo-px-4 zendo-py-3 zendo-text-left" onClick={() => router.push(hit.href)}>
          <span className="zendo-block zendo-text-sm zendo-font-medium zendo-text-cream">{hit.title}</span>
          <span className="zendo-mt-1 zendo-block zendo-truncate zendo-text-xs zendo-text-muted">{labelFor(hit.kind)} · {hit.detail}</span>
        </button>
      ))}
    </div>
  );
}
