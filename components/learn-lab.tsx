"use client";

import { useEffect, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { api } from "@/lib/sdk";
import type { CoinCard, QuoteView } from "@/lib/types";

export function LearnLab() {
  const [mint, setMint] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("FROG");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<CoinCard[]>("/api/coins?sort=new")
      .then((coins) => {
        const frog = coins.find((coin) => coin.symbol === "FROG") || coins[0];
        if (!frog) {
          setMint("");
          return;
        }
        setMint(frog.mint);
        setSymbol(frog.symbol);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load coins."));
  }, []);

  if (error) return <p className="zendo-text-coral">{error}</p>;
  if (mint === "") {
    return (
      <Panel>
        <h2 className="zendo-font-semibold">No coins yet</h2>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">The quote lab uses a coin that already exists on this chain. Create one on the launchpad, then come back.</p>
      </Panel>
    );
  }
  if (!mint) {
    return <div aria-busy="true" className="zendo-h-28 zendo-animate-pulse zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-ink" />;
  }

  return (
    <Panel>
      <h2 className="zendo-font-semibold">Quote 1 Z of {symbol}</h2>
      <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">This calls the same curve the launchpad uses. It does not send a trade.</p>
      <Button
        className="zendo-mt-4"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            setQuote(await api<QuoteView>(`/api/coins/${mint}/quote`, { method: "POST", body: JSON.stringify({ side: "buy", amount: "1" }) }));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Quote failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Quoting…" : "Run the quote"}
      </Button>
      {quote ? (
        <dl className="zendo-mt-4 zendo-grid zendo-gap-2 zendo-text-sm zendo-sm:zendo-grid-cols-3">
          <div>
            <dt className="zendo-text-muted">Tokens out</dt>
            <dd className="num zendo-font-semibold">{quote.tokens}</dd>
          </div>
          <div>
            <dt className="zendo-text-muted">Fee</dt>
            <dd className="num zendo-font-semibold">{quote.fee} Z</dd>
          </div>
          <div>
            <dt className="zendo-text-muted">Price after</dt>
            <dd className="num zendo-font-semibold">{quote.price}</dd>
          </div>
        </dl>
      ) : null}
    </Panel>
  );
}
