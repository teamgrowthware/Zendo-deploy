import Link from "next/link";
import type { AddressDetail, BlockDetail, BlockRow, TxRow, ValidatorRow } from "@/lib/types";
import { shortAddr, shortHash } from "@/lib/format";
import { BrandMark, TimeAgo } from "./chrome";
import { Badge, Panel } from "./ui";

export function Pager({ page, pages, base }: { page: number; pages: number; base: string }) {
  if (pages <= 1) return null;
  return (
    <div className="zendo-mt-4 zendo-flex zendo-items-center zendo-gap-3 zendo-text-sm">
      {page > 1 ? <Link className="zendo-text-lime" href={`${base}?page=${page - 1}`}>Previous</Link> : <span className="zendo-text-muted">Previous</span>}
      <span className="zendo-text-muted">{page} / {pages}</span>
      {page < pages ? <Link className="zendo-text-lime" href={`${base}?page=${page + 1}`}>Next</Link> : <span className="zendo-text-muted">Next</span>}
    </div>
  );
}

export function ExplorerNav() {
  const links = [
    ["/explorer/blocks", "Blocks"],
    ["/explorer/txs", "Transactions"],
    ["/explorer/addresses", "Addresses"],
    ["/explorer/contracts", "Contracts"],
    ["/explorer/validators", "Validators"],
    ["/explorer/staking", "Staking"],
    ["/explorer/stats", "Stats"],
  ];
  return (
    <div className="zendo-bg-ink zendo-mb-6 zendo-flex zendo-items-center zendo-gap-3 zendo-overflow-x-auto zendo-pb-1">
      <BrandMark kind="chain" className="zendo-shrink-0" />
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="zendo-pointer zendo-text-gold zendo-shrink-0 zendo-rounded-full zendo-border zendo-border-line zendo-px-3 zendo-py-1.5 zendo-text-sm hover:zendo-text-cream">
          {label}
        </Link>
      ))}
    </div>
  );
}

export function BlockTable({ blocks }: { blocks: BlockRow[] }) {
  return (
    <div className="zendo-overflow-x-auto zendo-rounded-3xl zendo-border zendo-border-line">
      <table className="zendo-w-full zendo-min-w-[640px] zendo-text-left zendo-text-sm">
        <thead className="zendo-text-muted">
          <tr>
            <th className="zendo-px-4 zendo-py-3 zendo-font-medium">Height</th>
            <th className="zendo-px-4 zendo-py-3 zendo-font-medium">Hash</th>
            <th className="zendo-px-4 zendo-py-3 zendo-font-medium">Proposer</th>
            <th className="zendo-px-4 zendo-py-3 zendo-font-medium">Txs</th>
            <th className="zendo-px-4 zendo-py-3 zendo-font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr key={block.height} className="zendo-border-t zendo-border-line">
              <td className="zendo-px-4 zendo-py-3"><Link className="zendo-text-lime" href={`/explorer/block/${block.height}`}>{block.height}</Link></td>
              <td className="zendo-px-4 zendo-py-3 zendo-font-mono zendo-text-xs">{shortHash(block.hash)}</td>
              <td className="zendo-px-4 zendo-py-3">{block.proposerName}</td>
              <td className="zendo-px-4 zendo-py-3">{block.txCount} {block.finalized ? <Badge tone="lime">final</Badge> : <Badge>pending</Badge>}</td>
              <td className="zendo-px-4 zendo-py-3 zendo-text-muted"><TimeAgo at={block.at} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TxTable({ txs }: { txs: TxRow[] }) {
  return (
    <div className="zendo-grid zendo-gap-2">
      {txs.map((tx) => (
        <Link key={tx.hash} href={`/explorer/tx/${tx.hash}`} className="zendo-rounded-2xl zendo-border zendo-border-line zendo-px-4 zendo-py-3 zendo-text-sm hover:zendo-border-lime/40">
          <div className="zendo-flex zendo-justify-between zendo-gap-3">
            <span>{tx.summary}</span>
            <span className="zendo-text-muted"><TimeAgo at={tx.at} /></span>
          </div>
          <p className="zendo-mt-1 zendo-font-mono zendo-text-xs zendo-text-muted">{shortHash(tx.hash)} · fee {tx.fee} Z</p>
        </Link>
      ))}
    </div>
  );
}

export function BlockBody({ block }: { block: BlockDetail }) {
  return (
    <div className="zendo-grid zendo-gap-4">
      <Panel className="zendo-grid zendo-gap-2 zendo-text-sm">
        <Row k="Height" v={String(block.height)} />
        <Row k="Hash" v={block.hash} mono />
        <Row k="Parent" v={block.parent} mono href={`/explorer/block/${Math.max(0, block.height - 1)}`} />
        <Row k="Proposer" v={block.proposerName} href={`/explorer/address/${block.proposer}`} />
        <Row k="State root" v={block.stateRoot} mono />
        <Row k="PoH slot" v={block.pohSlot === null ? "off" : String(block.pohSlot)} />
        <Row k="Gas" v={String(block.gasUsed)} />
        <Row k="Status" v={block.finalized ? "Finalized" : "Awaiting finality depth"} />
      </Panel>
      <TxTable txs={block.txs} />
    </div>
  );
}

export function TxBody({ tx, blockHeight }: { tx: TxRow; blockHeight: number | null }) {
  return (
    <Panel className="zendo-grid zendo-gap-2 zendo-text-sm">
      <Row k="Summary" v={tx.summary} />
      <Row k="Hash" v={tx.hash} mono />
      <Row k="Block" v={blockHeight === null ? "Mempool" : String(blockHeight)} href={blockHeight === null ? undefined : `/explorer/block/${blockHeight}`} />
      <Row k="From" v={`${tx.fromName} · ${shortAddr(tx.from)}`} href={`/explorer/address/${tx.from}`} />
      <Row k="To" v={`${tx.toName} · ${shortAddr(tx.to)}`} href={tx.to.startsWith("znd1") ? `/explorer/address/${tx.to}` : undefined} />
      <Row k="Amount" v={`${tx.amount} ${tx.symbol}`} />
      <Row k="Fee" v={`${tx.fee} Z`} />
      <Row k="Gas" v={String(tx.gasUsed)} />
    </Panel>
  );
}

export function AddressBody({ data }: { data: AddressDetail }) {
  return (
    <div className="zendo-grid zendo-gap-4">
      <Panel>
        <h1 className="zendo-font-display zendo-text-3xl zendo-font-bold">{data.name}</h1>
        <p className="zendo-mt-2 zendo-break-all zendo-font-mono zendo-text-xs zendo-text-muted">{data.address}</p>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Nonce {data.nonce}</p>
        <div className="zendo-mt-4 zendo-grid zendo-gap-2 zendo-text-sm">
          {data.balances.map((balance) => (
            <div key={balance.mint} className="zendo-flex zendo-justify-between">
              <span>{balance.symbol}</span>
              <span className="num">{balance.amount}</span>
            </div>
          ))}
          {data.balances.length === 0 ? <p className="zendo-text-muted">No balances.</p> : null}
        </div>
      </Panel>
      <TxTable txs={data.txs} />
    </div>
  );
}

export function ValidatorTable({ rows, stake }: { rows: ValidatorRow[]; stake?: boolean }) {
  return (
    <div className="zendo-grid zendo-gap-3">
      {rows.map((validator) => (
        <Panel key={validator.id}>
          <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-gap-2">
            <h2 className="zendo-font-semibold"><Link href={`/explorer/validators/${validator.id}`} className="hover:zendo-text-lime">{validator.moniker}</Link></h2>
            <Badge tone={validator.status === "active" ? "lime" : "gold"}>{validator.status}</Badge>
          </div>
          <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">{validator.region} · commission {validator.commission}% · uptime {validator.uptime}% · net APR {validator.apr}%</p>
          <p className="zendo-text-sm zendo-text-muted">Self stake {validator.selfStake} Z · delegated {validator.delegated} Z · blocks {validator.proposed}</p>
          <Link href={`/explorer/address/${validator.address}`} className="zendo-mt-2 zendo-inline-block zendo-text-xs zendo-text-lime">Address</Link>
          {stake && validator.status === "active" ? <p className="zendo-mt-2 zendo-text-sm"><Link className="zendo-text-lime" href="/app/stake">Delegate from your wallet</Link></p> : null}
        </Panel>
      ))}
    </div>
  );
}

function Row({ k, v, mono, href }: { k: string; v: string; mono?: boolean; href?: string }) {
  const value = href ? <Link href={href} className="zendo-text-lime">{v}</Link> : v;
  return (
    <div className="zendo-grid zendo-gap-1 zendo-sm:zendo-grid-cols-[140px_1fr]">
      <span className="zendo-text-muted">{k}</span>
      <span className={mono ? "zendo-break-all zendo-font-mono zendo-text-xs" : ""}>{value}</span>
    </div>
  );
}
