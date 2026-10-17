"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EMOJIS } from "@/lib/seed";
import { api } from "@/lib/sdk";
import type { CoinCard, CoinDetail, PublicUser, QuoteView } from "@/lib/types";
import { BrandMark, CopyButton, PriceChart, TimeAgo } from "./chrome";
import { Badge, Button, Field, Input, LoadingPanel, Panel, Textarea } from "./ui";

export function LaunchBoard() {
  const router = useRouter();
  const [coins, setCoins] = useState<CoinCard[] | null>(null);
  const [sort, setSort] = useState("trending");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () => {
      api<CoinCard[]>(`/api/coins?sort=${sort}&q=${encodeURIComponent(q)}`)
        .then((rows) => {
          if (!stop) setCoins(rows);
        })
        .catch((err) => {
          if (!stop) setError(err instanceof Error ? err.message : "Could not load coins.");
        });
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [sort, q]);

  return (
    <div className="zendo-grid zendo-gap-5">
      <div className="zendo-flex zendo-flex-col zendo-gap-3 zendo-sm:zendo-flex-row zendo-sm:zendo-items-center">
        <Input placeholder="Search name or ticker" value={q} onChange={(event) => setQ(event.target.value)} className="zendo-sm:zendo-max-w-xs" />
        <div className="zendo-flex zendo-gap-2 zendo-overflow-x-auto">
          {[
            ["trending", "Trending"],
            ["new", "New"],
            ["graduating", "Graduating"],
            ["volume", "Volume"],
          ].map(([id, label]) => (
            <button key={id} className={`zendo-pointer zendo-rounded-full zendo-px-3 zendo-py-1.5 zendo-text-sm ${sort === id ? "zendo-bg-lime zendo-text-ink" : "zendo-border zendo-border-line zendo-text-muted"}`} onClick={() => setSort(id)}>
              {label}
            </button>
          ))}
        </div>
        <Button className="zendo-sm:zendo-ml-auto" onClick={() => router.push("/launchpad/create")}>Create Coin</Button>
      </div>
      {error ? <p className="zendo-text-sm zendo-text-coral">{error}</p> : null}
      {coins && coins.length === 0 ? <Panel><p className="zendo-text-muted">No coins match that search. Create the first one on this board.</p></Panel> : null}
      <div className="zendo-grid zendo-gap-3 zendo-sm:zendo-grid-cols-2 zendo-lg:zendo-grid-cols-3">
        {(coins || []).map((coin) => (
          <Link key={coin.mint} href={`/launchpad/${coin.mint}`} className="zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-panel zendo-p-4 zendo-transition hover:zendo-border-lime/40">
            <div className="zendo-flex zendo-items-start zendo-gap-3">
              <span className="zendo-grid zendo-h-12 zendo-w-12 zendo-place-items-center zendo-rounded-2xl zendo-text-2xl" style={{ background: `hsl(${coin.hue} 70% 42% / 0.25)` }}>{coin.emoji}</span>
              <div className="zendo-min-w-0">
                <p className="zendo-truncate zendo-font-semibold">{coin.name}</p>
                <p className="zendo-text-xs zendo-text-muted">${coin.symbol}</p>
              </div>
              <span className={`zendo-ml-auto zendo-text-sm ${coin.changeUp ? "zendo-text-lime" : "zendo-text-coral"}`}>{coin.change}</span>
            </div>
            <div className="zendo-mt-4 zendo-flex zendo-items-end zendo-justify-between zendo-text-sm">
              <div>
                <p className="zendo-text-xs zendo-text-muted">Market cap</p>
                <p className="num zendo-font-semibold">{coin.marketCap} Z</p>
              </div>
              <div className="zendo-text-right">
                <p className="zendo-text-xs zendo-text-muted">{coin.graduated ? "Pool" : `${coin.progress.toFixed(0)}% to pool`}</p>
                <p className="zendo-text-xs zendo-text-muted">{coin.replies} replies · {coin.votes} votes</p>
              </div>
            </div>
            {coin.featured ? <div className="zendo-mt-3"><Badge tone="gold">Promoted</Badge></div> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function CreateCoinForm() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", symbol: "", description: "", emoji: "🐸", hue: 88 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ user: PublicUser | null }>("/api/auth/me").then((data) => setUser(data.user)).catch(() => setUser(null));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const coin = await api<CoinDetail>("/api/coins", { method: "POST", body: JSON.stringify(form) });
      toast.success(`${coin.symbol} is on the curve`);
      router.push(`/launchpad/${coin.mint}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the coin.");
      setBusy(false);
    }
  }

  if (user === undefined) return <p className="zendo-text-muted">Checking your session…</p>;
  if (!user) {
    return (
      <Panel>
        <p>Log in before you create a coin. The 0.2 Z creation fee is paid from your wallet on this chain.</p>
        <Button className="zendo-mt-4" onClick={() => router.push("/signin?next=/launchpad/create")}>Sign in</Button>
      </Panel>
    );
  }

  return (
    <form className="zendo-grid zendo-max-w-xl zendo-gap-4" onSubmit={submit}>
      <Field label="Name">
        <Input value={form.name} onChange={(event) => { const name = event.target.value; setForm((current) => ({ ...current, name })); }} required />
      </Field>
      <Field label="Ticker" hint="2–8 letters. ZCOIN is reserved.">
        <Input value={form.symbol} onChange={(event) => { const symbol = event.target.value.toUpperCase(); setForm((current) => ({ ...current, symbol })); }} required />
      </Field>
      <Field label="Description">
        <Textarea value={form.description} onChange={(event) => { const description = event.target.value; setForm((current) => ({ ...current, description })); }} required />
      </Field>
      <div>
        <p className="zendo-mb-2 zendo-text-sm zendo-font-medium">Icon</p>
        <div className="zendo-flex zendo-flex-wrap zendo-gap-2">
          {EMOJIS.map((emoji) => (
            <button type="button" key={emoji} className={`zendo-pointer zendo-h-10 zendo-w-10 zendo-rounded-xl zendo-text-xl ${form.emoji === emoji ? "zendo-bg-lime" : "zendo-bg-panel-2"}`} onClick={() => setForm((current) => ({ ...current, emoji }))}>
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <Field label="Color">
        <input type="range" min={0} max={360} value={form.hue} onChange={(event) => { const hue = Number(event.target.value); setForm((current) => ({ ...current, hue })); }} />
      </Field>
      <p className="zendo-text-sm zendo-text-muted">Creation fee is 0.2 ZCoin, taken from your wallet. Trading then uses the bonding curve until the pool opens.</p>
      {error ? <p className="zendo-text-sm zendo-text-coral">{error}</p> : null}
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create Coin"}</Button>
    </form>
  );
}

export function CoinScreen({ mint }: { mint: string }) {
  const router = useRouter();
  const [coin, setCoin] = useState<CoinDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);

  async function load() {
    const [next, me] = await Promise.all([
      api<CoinDetail>(`/api/coins/${mint}`),
      api<{ user: PublicUser | null }>("/api/auth/me"),
    ]);
    setCoin(next);
    setUser(me.user);
  }

  useEffect(() => {
    let stop = false;
    const pull = () => {
      Promise.all([
        api<CoinDetail>(`/api/coins/${mint}`),
        api<{ user: PublicUser | null }>("/api/auth/me"),
      ])
        .then(([next, me]) => {
          if (stop) return;
          setCoin(next);
          setUser(me.user);
        })
        .catch((err) => {
          if (!stop) setError(err instanceof Error ? err.message : "Coin unavailable.");
        });
    };
    pull();
    const id = setInterval(pull, 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [mint]);

  useEffect(() => {
    if (!amount) return;
    const timer = setTimeout(() => {
      api<QuoteView>(`/api/coins/${mint}/quote`, { method: "POST", body: JSON.stringify({ side, amount }) })
        .then((next) => {
          setQuote(next);
          setQuoteError(null);
        })
        .catch((err) => {
          setQuote(null);
          setQuoteError(err instanceof Error ? err.message : "No quote.");
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [amount, side, mint, coin?.price]);

  async function trade() {
    setBusy(true);
    try {
      await api(`/api/coins/${mint}/trade`, { method: "POST", body: JSON.stringify({ side, amount }) });
      toast.success(side === "buy" ? "Buy included" : "Sell included");
      setAmount("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trade failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Panel><p className="zendo-text-coral">{error}</p></Panel>;
  if (!coin) return <LoadingPanel label="Loading the curve" />;

  return (
    <div className="zendo-grid zendo-gap-6 zendo-lg:zendo-grid-cols-[minmax(0,1fr)_340px]">
      <div className="zendo-order-2 zendo-grid zendo-gap-4 zendo-lg:zendo-order-1">
        <BrandMark kind="coin" />
        <div className="zendo-flex zendo-items-start zendo-gap-3">
          <span className="zendo-grid zendo-h-14 zendo-w-14 zendo-place-items-center zendo-rounded-2xl zendo-text-3xl" style={{ background: `hsl(${coin.hue} 70% 42% / 0.25)` }}>{coin.emoji}</span>
          <div>
            <h1 className="zendo-font-display zendo-text-3xl zendo-font-bold">{coin.name}</h1>
            <p className="zendo-text-sm zendo-text-muted">${coin.symbol} · {coin.creatorName} · <TimeAgo at={coin.createdAt} /></p>
          </div>
          <div className="zendo-ml-auto zendo-flex zendo-gap-2">
            {coin.graduated ? <Badge tone="lime">Pool</Badge> : <Badge>Curve</Badge>}
            {coin.featured ? <Badge tone="gold">Promoted</Badge> : null}
          </div>
        </div>
        <Panel>
          <div className="zendo-mb-2 zendo-flex zendo-items-end zendo-justify-between">
            <div>
              <p className="zendo-text-xs zendo-text-muted">Price</p>
              <p className="num zendo-text-2xl zendo-font-semibold">{coin.price} Z</p>
            </div>
            <p className={coin.changeUp ? "zendo-text-lime" : "zendo-text-coral"}>{coin.change}</p>
          </div>
          <PriceChart points={coin.chart} up={coin.changeUp} />
          <div className="zendo-mt-3">
            <div className="zendo-mb-1 zendo-flex zendo-justify-between zendo-text-xs zendo-text-muted">
              <span>{coin.venue === "pool" ? "Graduated into the pool" : "Progress to the pool"}</span>
              <span>{coin.realZ} / {coin.graduationZ} Z</span>
            </div>
            <div className="zendo-h-2 zendo-overflow-hidden zendo-rounded-full zendo-bg-ink">
              <div className="zendo-h-full zendo-bg-lime" style={{ width: `${Math.min(100, coin.progress)}%` }} />
            </div>
          </div>
        </Panel>
        <p className="zendo-text-sm zendo-leading-6 zendo-text-muted">{coin.description}</p>
        <Panel>
          <h2 className="zendo-font-semibold">Holders</h2>
          <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm">
            {coin.holders.length === 0 ? <p className="zendo-text-muted">No holders yet.</p> : null}
            {coin.holders.map((holder) => (
              <div key={holder.address} className="zendo-flex zendo-justify-between zendo-gap-3">
                <Link href={`/explorer/address/${holder.address}`} className="zendo-truncate zendo-text-muted hover:zendo-text-cream">{holder.name}</Link>
                <span className="num">{holder.amount} · {holder.pct}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="zendo-font-semibold">Thread</h2>
          {user ? (
            <form
              className="zendo-mt-3 zendo-grid zendo-gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  const next = await api<CoinDetail>(`/api/coins/${mint}/reply`, { method: "POST", body: JSON.stringify({ body: reply }) });
                  setCoin(next);
                  setReply("");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Reply failed.");
                }
              }}
            >
              <Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Say something specific." />
              <Button type="submit" size="sm" className="zendo-justify-self-start">Post</Button>
            </form>
          ) : (
            <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Sign in to reply.</p>
          )}
          <div className="zendo-mt-4 zendo-grid zendo-gap-3">
            {coin.replyRows.length === 0 ? <p className="zendo-text-sm zendo-text-muted">No replies yet.</p> : null}
            {coin.replyRows.map((row) => (
              <div key={row.id} className="zendo-border-t zendo-border-line zendo-pt-3">
                <p className="zendo-text-sm"><span className="zendo-font-medium">{row.name}</span> <span className="zendo-text-muted"><TimeAgo at={row.at} /></span></p>
                <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">{row.body}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <aside className="zendo-order-1 zendo-lg:zendo-sticky zendo-lg:zendo-top-20 zendo-lg:zendo-order-2 zendo-lg:zendo-self-start">
        <Panel>
          <div className="zendo-grid zendo-grid-cols-2 zendo-gap-2">
            {(["buy", "sell"] as const).map((item) => (
              <button key={item} className={`zendo-pointer zendo-h-10 zendo-rounded-xl zendo-text-sm zendo-font-semibold ${side === item ? "zendo-bg-lime zendo-text-ink" : "zendo-bg-ink zendo-text-muted"}`} onClick={() => setSide(item)}>
                {item === "buy" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
          <Field label={side === "buy" ? "You pay (ZCoin)" : "You sell (tokens)"} hint={coin.yourTokens ? `You hold ${coin.yourTokens} ${coin.symbol}` : undefined}>
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" />
          </Field>
          {amount && quote ? (
            <div className="zendo-mt-3 zendo-grid zendo-gap-1 zendo-text-sm zendo-text-muted">
              <Row k="You receive" v={side === "buy" ? `${quote.tokens} ${coin.symbol}` : `${quote.proceeds} Z`} />
              <Row k="Fee" v={`${quote.fee} Z`} />
              <Row k="Network" v={`${quote.gas} Z`} />
              <Row k="Price impact" v={quote.impact} />
              {quote.capped ? <p className="zendo-text-gold">Filled up to the tokens left on the curve.</p> : null}
            </div>
          ) : null}
          {amount && quoteError ? <p className="zendo-mt-2 zendo-text-sm zendo-text-coral">{quoteError}</p> : null}
          {user ? (
            <Button className="zendo-mt-4 zendo-w-full" disabled={busy || !amount} onClick={trade}>{busy ? "Submitting…" : side === "buy" ? "Buy" : "Sell"}</Button>
          ) : (
            <Button className="zendo-mt-4 zendo-w-full" onClick={() => router.push(`/signin?next=/launchpad/${mint}`)}>Sign in to trade</Button>
          )}
          <div className="zendo-mt-4 zendo-flex zendo-flex-wrap zendo-gap-2">
            {user ? (
              <>
                <Button size="sm" variant="outline" onClick={async () => {
                  const next = await api<CoinDetail>(`/api/coins/${mint}/vote`, { method: "POST", body: JSON.stringify({ direction: coin.youVoted === 1 ? "clear" : "up" }) });
                  setCoin(next);
                }}>Upvote {coin.votes}</Button>
                <Button size="sm" variant="ghost" onClick={async () => {
                  const reason = window.prompt("Reason: Scam, Spam, Impersonation, or Other");
                  if (!reason) return;
                  try {
                    await api(`/api/coins/${mint}/report`, { method: "POST", body: JSON.stringify({ reason, detail: "" }) });
                    toast.success("Report sent to the operator desk");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Report failed.");
                  }
                }}>Report</Button>
                {user.address === coin.creator || user.role === "admin" ? (
                  <Button size="sm" variant="gold" onClick={async () => {
                    if (!window.confirm("Promote this coin for 50 ZCoin?")) return;
                    try {
                      const next = await api<CoinDetail>(`/api/coins/${mint}/promote`, { method: "POST", body: JSON.stringify({}) });
                      setCoin(next);
                      toast.success("Promoted for 24 hours");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not promote.");
                    }
                  }}>Promote</Button>
                ) : null}
              </>
            ) : null}
          </div>
          <p className="zendo-mt-4 zendo-break-all zendo-text-xs zendo-text-muted">Mint {coin.mint}</p>
          <CopyButton value={`${window.location.origin}/launchpad/${coin.mint}?ref=${user?.referralCode || ""}`} label="Copy share link" />
          <p className="zendo-mt-2 zendo-text-xs zendo-text-muted">Creator fees earned: {coin.creatorFees} Z</p>
        </Panel>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="zendo-flex zendo-justify-between zendo-gap-3">
      <span>{k}</span>
      <span className="num zendo-text-cream">{v}</span>
    </div>
  );
}
