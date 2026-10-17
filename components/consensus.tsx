"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui";

type Peer = {
  addr: string;
  height: number;
  tip: string;
  lastSeenMs: number;
  failures: number;
  seed: boolean;
  rttMs?: number;
  region?: string;
};

type Consensus = {
  height: number;
  finalized: number;
  voteFinalized?: number;
  reorgs: number;
  tip: string;
  sideBlocks: number;
  votes?: number;
  slashes?: number;
  validators?: number;
  blockReward?: number;
};

type ValidatorRow = { index: number; address: string; balance: number };
type SlashRow = { height: number; proposer: number; amount: number };
type BondRow = { delegator: string; validator: number; amount: number };
type Staking = { address?: string; bonds?: BondRow[] };

type Payload = {
  ok: boolean;
  error?: string;
  chainId?: string;
  consensus?: Consensus;
  peers?: Peer[];
  validators?: ValidatorRow[] | null;
  slashes?: SlashRow[] | null;
  staking?: Staking | null;
};

export function NodeConsensus() {
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () => {
      fetch("/api/node")
        .then((response) => response.json())
        .then((body: Payload) => {
          if (!stop) setPayload(body);
        })
        .catch(() => {
          if (!stop) setPayload({ ok: false, error: "Node status could not be loaded." });
        });
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  if (!payload) {
    return (
      <Panel>
        <div aria-busy="true" aria-live="polite">
        <h2 className="zendo-font-semibold">Local node</h2>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Checking the node RPC on this machine.</p>
        <div className="zendo-mt-4 zendo-grid zendo-gap-3 zendo-sm:zendo-grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="zendo-h-16 zendo-animate-pulse zendo-rounded-2xl zendo-border zendo-border-line zendo-bg-ink" />
          ))}
        </div>
        </div>
      </Panel>
    );
  }

  if (!payload.ok || !payload.consensus) {
    return (
      <Panel>
        <h2 className="zendo-font-semibold">Local node</h2>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-coral">{payload.error || "The local node is not running."}</p>
        <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">
          From the repo, run <span className="zendo-text-cream">cargo run -- run --data ../node-data --listen 127.0.0.1:47110 --rpc 127.0.0.1:47111 --peer 127.0.0.1:47112</span> inside <span className="zendo-text-cream">node/</span>. Add a second process with the ports swapped so they exchange listen addresses.
        </p>
      </Panel>
    );
  }

  const rows = payload.peers || [];
  return (
    <Panel>
      <div className="zendo-flex zendo-flex-wrap zendo-items-end zendo-justify-between zendo-gap-3">
        <div>
          <h2 className="zendo-font-semibold">Local node</h2>
          <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">{String(payload.chainId)} · updates every few seconds from JSON-RPC on localhost.</p>
        </div>
        <p className="num zendo-text-sm zendo-text-lime">height {payload.consensus.height}</p>
      </div>
      <div className="zendo-mt-4 zendo-grid zendo-gap-3 zendo-sm:zendo-grid-cols-4">
        {[
          ["Depth finality", payload.consensus.finalized],
          ["Vote finality", payload.consensus.voteFinalized ?? 0],
          ["Slash events", payload.consensus.slashes ?? 0],
          ["Validators", payload.consensus.validators ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="zendo-rounded-2xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
            <p className="zendo-text-xs zendo-text-muted">{label}</p>
            <p className="num zendo-text-xl zendo-font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <p className="zendo-mt-4 zendo-break-all zendo-text-xs zendo-text-muted">Tip {payload.consensus.tip}</p>
      <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">
        Depth finality keeps moving on this node when a peer is quiet. Vote finality still needs a quorum of validator signatures ({payload.consensus.votes ?? 0} stored), so one quiet signer does not count as a vote from the other. A proposer who signs two blocks at one height loses 10% of their balance. The block reward is {payload.consensus.blockReward ?? 0}. A region name is a hello label. A second data directory joins this chain only when it was enrolled at genesis.
      </p>
      {rows.length ? (
        <div className="zendo-mt-4 zendo-overflow-x-auto">
          <table className="zendo-w-full zendo-min-w-[520px] zendo-text-left zendo-text-sm">
            <thead className="zendo-text-muted">
              <tr>
                <th className="zendo-py-2 zendo-font-medium">Listen address</th>
                <th className="zendo-py-2 zendo-font-medium">Region</th>
                <th className="zendo-py-2 zendo-font-medium">Latency</th>
                <th className="zendo-py-2 zendo-font-medium">Height</th>
                <th className="zendo-py-2 zendo-font-medium">Source</th>
                <th className="zendo-py-2 zendo-font-medium">Failures</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((peer) => (
                <tr key={peer.addr} className="zendo-border-t zendo-border-line">
                  <td className="zendo-py-2 zendo-font-mono zendo-text-xs">{peer.addr}</td>
                  <td className="zendo-py-2">{peer.region || "—"}</td>
                  <td className="num zendo-py-2">{peer.rttMs ? `${peer.rttMs} ms` : "—"}</td>
                  <td className="num zendo-py-2">{peer.height}</td>
                  <td className="zendo-py-2">{peer.seed ? "seed" : "gossip"}</td>
                  <td className="num zendo-py-2">{peer.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="zendo-mt-4 zendo-text-sm zendo-text-muted">No peers yet. Pass --peer with another node&apos;s listen address, or wait for a neighbor to advertise one.</p>
      )}
      {payload.validators ? (
        <div className="zendo-mt-4 zendo-overflow-x-auto">
          <table className="zendo-w-full zendo-min-w-[520px] zendo-text-left zendo-text-sm">
            <caption className="zendo-pb-2 zendo-text-left zendo-text-xs zendo-text-muted">Validator balances on this node</caption>
            <thead className="zendo-text-muted">
              <tr>
                <th className="zendo-py-2 zendo-font-medium">Index</th>
                <th className="zendo-py-2 zendo-font-medium">Address</th>
                <th className="zendo-py-2 zendo-font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {payload.validators.map((validator) => (
                <tr key={validator.index} className="zendo-border-t zendo-border-line">
                  <td className="num zendo-py-2">{validator.index}</td>
                  <td className="zendo-py-2 zendo-font-mono zendo-text-xs">{validator.address}</td>
                  <td className="num zendo-py-2">{validator.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {payload.staking?.bonds?.length ? (
        <div className="zendo-mt-4 zendo-overflow-x-auto">
          <table className="zendo-w-full zendo-min-w-[520px] zendo-text-left zendo-text-sm">
            <caption className="zendo-pb-2 zendo-text-left zendo-text-xs zendo-text-muted">Bonds at {payload.staking.address}</caption>
            <thead className="zendo-text-muted">
              <tr>
                <th className="zendo-py-2 zendo-font-medium">Delegator</th>
                <th className="zendo-py-2 zendo-font-medium">Validator</th>
                <th className="zendo-py-2 zendo-font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payload.staking.bonds.map((bond) => (
                <tr key={`${bond.delegator}-${bond.validator}`} className="zendo-border-t zendo-border-line">
                  <td className="zendo-py-2 zendo-font-mono zendo-text-xs">{bond.delegator}</td>
                  <td className="num zendo-py-2">{bond.validator}</td>
                  <td className="num zendo-py-2">{bond.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {payload.slashes?.length ? (
        <div className="zendo-mt-4 zendo-overflow-x-auto">
          <table className="zendo-w-full zendo-min-w-[520px] zendo-text-left zendo-text-sm">
            <caption className="zendo-pb-2 zendo-text-left zendo-text-xs zendo-text-muted">Slash events</caption>
            <thead className="zendo-text-muted">
              <tr>
                <th className="zendo-py-2 zendo-font-medium">Height</th>
                <th className="zendo-py-2 zendo-font-medium">Validator</th>
                <th className="zendo-py-2 zendo-font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payload.slashes.map((slash) => (
                <tr key={`${slash.height}-${slash.proposer}`} className="zendo-border-t zendo-border-line">
                  <td className="num zendo-py-2">{slash.height}</td>
                  <td className="num zendo-py-2">{slash.proposer}</td>
                  <td className="num zendo-py-2">{slash.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}
