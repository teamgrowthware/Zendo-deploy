"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Panel, Textarea } from "@/components/ui";
import { api } from "@/lib/sdk";
import type { MarketView, PublicUser } from "@/lib/types";

export function MarketDesk({ focusId }: { focusId?: string }) {
  const router = useRouter();
  const [data, setData] = useState<MarketView | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", summary: "", kind: "contract" });
  const [code, setCode] = useState("");

  useEffect(() => {
    Promise.all([api<MarketView>("/api/market"), api<{ user: PublicUser | null }>("/api/auth/me")])
      .then(([board, me]) => {
        setData(board);
        setUser(me.user);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the marketplace."));
  }, []);

  if (error) return <p className="zendo-text-coral">{error}</p>;
  if (!data) {
    return (
      <div aria-busy="true" className="zendo-grid zendo-gap-3">
        <div className="zendo-h-24 zendo-animate-pulse zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-ink" />
        <div className="zendo-h-40 zendo-animate-pulse zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-ink" />
      </div>
    );
  }

  return (
    <div className="zendo-grid zendo-gap-4">
      <Panel>
        <h2 className="zendo-font-semibold">Referral code</h2>
        <form
          className="zendo-mt-3 zendo-flex zendo-flex-wrap zendo-gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const next = code.trim();
            if (!next) return;
            if (!user) {
              router.push(`/signup?ref=${encodeURIComponent(next)}`);
              return;
            }
            try {
              setData(await api<MarketView>("/api/market", { method: "POST", body: JSON.stringify({ action: "referral", code: next }) }));
              setCode("");
              toast.success("Referral code saved. Your next coin gets the ranking boost.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not save that code.");
            }
          }}
        >
          <Input className="zendo-max-w-xs" placeholder="Enter a referral code" value={code} onChange={(event) => setCode(event.target.value)} />
          <Button type="submit" size="sm">{user ? "Apply Referral Code" : "Sign Up with code"}</Button>
        </form>
        <h2 className="zendo-mt-6 zendo-font-semibold">Referral codes</h2>
        {data.yourCode ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Your code is <span className="zendo-text-cream">{data.yourCode}</span>. New accounts can enter it at signup.</p> : null}
        {data.leaders.length ? (
          <ol className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm">
            {data.leaders.map((row) => (
              <li key={row.code} className="zendo-flex zendo-justify-between zendo-gap-3 zendo-border-t zendo-border-line zendo-pt-2">
                <span>{row.name} · {row.code}</span>
                <span className="num">{row.count}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">No referrals yet. A signup that uses a code is what counts.</p>
        )}
      </Panel>
      {!focusId && user ? (
        <form
          className="zendo-grid zendo-gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const known = new Set((data?.listings || []).map((row) => row.id));
              const next = await api<MarketView>("/api/market", { method: "POST", body: JSON.stringify(draft) });
              setData(next);
              setDraft({ name: "", summary: "", kind: "contract" });
              toast.success("Listing published");
              const created = next.listings.find((row) => !known.has(row.id));
              if (created) router.push(`/market/${created.id}`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not publish.");
            }
          }}
        >
          <Panel className="zendo-grid zendo-gap-3">
            <h2 className="zendo-font-semibold">Publish a module</h2>
            <p className="zendo-text-sm zendo-text-muted">Costs 1 ZCoin. The listing is a ledger transaction. Accounts that brought referrals rank higher on the board.</p>
            <label className="zendo-grid zendo-gap-1 zendo-text-sm">
              Name
              <Input value={draft.name} onChange={(event) => { const name = event.target.value; setDraft((current) => ({ ...current, name })); }} />
            </label>
            <label className="zendo-grid zendo-gap-1 zendo-text-sm">
              Summary
              <Textarea value={draft.summary} onChange={(event) => { const summary = event.target.value; setDraft((current) => ({ ...current, summary })); }} />
            </label>
            <label className="zendo-grid zendo-gap-1 zendo-text-sm">
              Kind
              <select
                className="zendo-default zendo-h-11 zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3 zendo-text-sm"
                value={draft.kind}
                onChange={(event) => { const kind = event.target.value; setDraft((current) => ({ ...current, kind })); }}
              >
                <option value="contract">Contract</option>
                <option value="sdk">SDK</option>
                <option value="app">App</option>
              </select>
            </label>
            <Button type="submit" size="sm" className="zendo-justify-self-start">List Module</Button>
          </Panel>
        </form>
      ) : null}
      {!focusId && !user ? (
        <Panel>
          Log in to publish or rate. <Link href="/signin?next=/market" className="zendo-text-lime">Log In</Link>
        </Panel>
      ) : null}
      {focusId ? <Link href="/market" className="zendo-text-sm zendo-text-lime">All listings</Link> : null}
      {(() => {
        const shown = focusId ? data.listings.filter((listing) => listing.id === focusId) : data.listings;
        if (focusId && shown.length === 0) return <Panel>That listing is not on this chain.</Panel>;
        if (!shown.length) return <Panel>No modules published yet.</Panel>;
        return (
        <div className="zendo-grid zendo-grid-cols-1 zendo-gap-4 zendo-lg:zendo-grid-cols-3">
        {shown.map((listing) => (
        <Panel key={listing.id}>
          <p className="zendo-text-xs zendo-uppercase zendo-tracking-wide zendo-text-gold">{listing.kind}</p>
          {focusId ? <h2 className="zendo-mt-1 zendo-font-semibold">{listing.name}</h2> : <Link href={`/market/${listing.id}`} className="zendo-mt-1 zendo-block zendo-font-semibold hover:zendo-text-lime">{listing.name}</Link>}
          <p className="zendo-mt-2 zendo-text-sm zendo-leading-6 zendo-text-muted">{listing.summary}</p>
          <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">{listing.authorName} · {listing.votes ? `${listing.rating} from ${listing.votes}` : "No ratings yet"} · referral boost {listing.boost}</p>
          {user ? (
            <div className="zendo-mt-3 zendo-flex zendo-gap-2">
              {[1, 2, 3, 4, 5].map((stars) => (
                <Button
                  key={stars}
                  size="sm"
                  variant={listing.yours === stars ? "primary" : "outline"}
                  onClick={async () => {
                    try {
                      setData(await api<MarketView>(`/api/market/${listing.id}`, { method: "POST", body: JSON.stringify({ stars }) }));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Rating failed.");
                    }
                  }}
                >
                  {stars}
                </Button>
              ))}
            </div>
          ) : null}
        </Panel>
        ))}
        </div>
        );
      })()}
    </div>
  );
}
