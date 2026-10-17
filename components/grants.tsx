"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TimeAgo } from "@/components/chrome";
import { Badge, Button, Input, Panel, Textarea } from "@/components/ui";
import { api } from "@/lib/sdk";
import type { GrantsView, PublicUser } from "@/lib/types";

export function GrantsDesk() {
  const [data, setData] = useState<GrantsView | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "", milestone: "", amount: "10" });

  useEffect(() => {
    Promise.all([api<GrantsView>("/api/grants"), api<{ user: PublicUser | null }>("/api/auth/me")])
      .then(([board, me]) => {
        setData(board);
        setUser(me.user);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load grants."));
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
        <p className="zendo-text-sm zendo-text-muted">Treasury balance</p>
        <p className="num zendo-mt-1 zendo-text-2xl zendo-font-semibold">{data.treasury} Z</p>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">
          A grant pays the author from this balance after yes votes clear 1,000 ZCoin and {data.lockSeconds} seconds have passed. The test harness skips that wait.
        </p>
      </Panel>
      {user ? (
        <form
          className="zendo-grid zendo-gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const next = await api<GrantsView>("/api/grants", { method: "POST", body: JSON.stringify(draft) });
              setData(next);
              setDraft({ title: "", body: "", milestone: "", amount: "10" });
              toast.success("Grant filed");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not file the grant.");
            }
          }}
        >
          <Panel className="zendo-grid zendo-gap-3">
            <h2 className="zendo-font-semibold">Apply for treasury Z</h2>
            <label className="zendo-grid zendo-gap-1 zendo-text-sm">
              Title
              <Input value={draft.title} onChange={(event) => { const title = event.target.value; setDraft((current) => ({ ...current, title })); }} />
            </label>
            <label className="zendo-grid zendo-gap-1 zendo-text-sm">
              What you will build
              <Textarea value={draft.body} onChange={(event) => { const body = event.target.value; setDraft((current) => ({ ...current, body })); }} />
            </label>
            <label className="zendo-grid zendo-gap-1 zendo-text-sm">
              Milestone the payout names
              <Input value={draft.milestone} onChange={(event) => { const milestone = event.target.value; setDraft((current) => ({ ...current, milestone })); }} />
            </label>
            <label className="zendo-grid zendo-gap-1 zendo-text-sm">
              Amount in ZCoin, from 1 to 5,000
              <Input inputMode="decimal" value={draft.amount} onChange={(event) => { const amount = event.target.value; setDraft((current) => ({ ...current, amount })); }} />
            </label>
            <Button type="submit" size="sm" className="zendo-justify-self-start">
              File grant
            </Button>
          </Panel>
        </form>
      ) : (
        <Panel>
          Sign in to file or vote. <Link href="/signin?next=/grants" className="zendo-text-lime">Sign in</Link>
        </Panel>
      )}
      {data.grants.length === 0 ? <Panel>No grants filed yet.</Panel> : null}
      {data.grants.map((grant) => (
        <Panel key={grant.id}>
          <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-gap-2">
            <h2 className="zendo-font-semibold">{grant.title}</h2>
            <Badge tone={grant.status === "paid" ? "lime" : "gold"}>{grant.status}</Badge>
          </div>
          <p className="zendo-mt-2 zendo-text-sm zendo-leading-6 zendo-text-muted">{grant.body}</p>
          <p className="zendo-mt-2 zendo-text-sm zendo-text-cream">{grant.amount} Z · {grant.milestone}</p>
          <p className="zendo-mt-2 zendo-text-xs zendo-text-muted">
            {grant.authorName} · {grant.locked ? "unlocks" : "unlocked"} <TimeAgo at={grant.unlockAt} /> · quorum {grant.quorumMet ? "met" : "open"}
          </p>
          <div className="zendo-mt-3 zendo-h-2 zendo-overflow-hidden zendo-rounded-full zendo-bg-ink">
            <div className="zendo-h-full zendo-bg-lime" style={{ width: `${grant.yesPct}%` }} />
          </div>
          <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Yes {grant.yes} · No {grant.no}</p>
          {user && grant.status === "active" ? (
            <div className="zendo-mt-3 zendo-flex zendo-flex-wrap zendo-gap-2">
              {(["yes", "no"] as const).map((choice) => (
                <Button
                  key={choice}
                  size="sm"
                  variant={grant.yourVote === choice ? "primary" : "outline"}
                  onClick={async () => {
                    try {
                      setData(await api<GrantsView>(`/api/grants/${grant.id}`, { method: "POST", body: JSON.stringify({ choice }) }));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Vote failed.");
                    }
                  }}
                >
                  {choice}
                </Button>
              ))}
              <Button
                size="sm"
                variant="gold"
                disabled={!grant.passed || grant.locked}
                onClick={async () => {
                  try {
                    setData(await api<GrantsView>(`/api/grants/${grant.id}`, { method: "POST", body: JSON.stringify({ action: "pay" }) }));
                    toast.success("Treasury paid the grant");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Payout failed.");
                  }
                }}
              >
                Pay from treasury
              </Button>
            </div>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}
