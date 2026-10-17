"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/sdk";
import type { AdminCoin, AdminPerson, AdminView, TicketView } from "@/lib/types";
import { TimeAgo } from "./chrome";
import { Badge, Button, Input, Panel, Textarea } from "./ui";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

function bytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function OperatorPanels({ data, onChange }: { data: AdminView; onChange: (next: AdminView) => void }) {
  async function act(body: Record<string, unknown>) {
    const next = await api<AdminView>("/api/admin", { method: "POST", body: JSON.stringify(body) });
    onChange(next);
    return next;
  }

  return (
    <>
      <HealthPanel data={data} />
      <PeoplePanel data={data} act={act} />
      <TicketPanel data={data} onChange={onChange} act={act} />
      <CoinPanel data={data} act={act} />
      <GovernPanel data={data} />
      <ToolsPanel />
    </>
  );
}

function HealthPanel({ data }: { data: AdminView }) {
  const health = data.health;
  return (
    <Panel>
      <h2 className="zendo-font-semibold">System health</h2>
      <div className="zendo-mt-3 zendo-grid zendo-gap-3 zendo-sm:zendo-grid-cols-3">
        <Metric k="Block height" v={String(health?.height ?? data.height)} />
        <Metric k="Last block" v={health?.lastBlockAt ? "" : "Waiting"} extra={health?.lastBlockAt ? <TimeAgo at={health.lastBlockAt} /> : null} />
        <Metric k="Accounts" v={String(health?.accounts ?? 0)} />
        <Metric k="Tickets" v={String(health?.tickets ?? data.tickets.length)} />
        <Metric k="Coins" v={String(health?.coins ?? 0)} />
        <Metric k="Ledger" v={bytes(health?.stateBytes ?? 0)} />
        <Metric k="Disk free" v={bytes(health?.diskFree ?? 0)} />
        <Metric k="Disk size" v={bytes(health?.diskTotal ?? 0)} />
        <Metric k="Engine tests" v={health ? `${health.testsPassed} passed, ${health.testsFailed} failed` : "Not recorded"} />
      </div>
      <p className="zendo-mt-3 zendo-text-xs zendo-text-muted">The engine check is the last run recorded with this build. It is not a live host scan.</p>
    </Panel>
  );
}

function Metric({ k, v, extra }: { k: string; v: string; extra?: React.ReactNode }) {
  return (
    <div>
      <p className="zendo-text-xs zendo-text-muted">{k}</p>
      <p className="num zendo-mt-1 zendo-text-sm zendo-font-semibold">{extra || v}</p>
    </div>
  );
}

function PeoplePanel({ data, act }: { data: AdminView; act: (body: Record<string, unknown>) => Promise<AdminView> }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [paused, setPaused] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const people = (data.people || []).filter((person) => {
    const hay = `${person.displayName} ${person.email} ${person.address}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (role !== "all" && person.role !== role) return false;
    if (paused === "paused" && !person.banned) return false;
    if (paused === "active" && person.banned) return false;
    return true;
  });
  return (
    <Panel>
      <h2 className="zendo-font-semibold">Accounts</h2>
      <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">Pausing an account blocks sign-in and keeps the ledger rows.</p>
      <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-sm:zendo-grid-cols-3">
        <Input aria-label="Search accounts" placeholder="Name, email, or address" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="zendo-default zendo-h-11 zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3" aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="all">All roles</option>
          {["user", "creator", "moderator", "admin"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="zendo-default zendo-h-11 zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3" aria-label="Filter by pause" value={paused} onChange={(event) => setPaused(event.target.value)}>
          <option value="all">Active and paused</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </div>
      <div className="zendo-desk-scroll zendo-mt-3 zendo-grid zendo-gap-3">
        {people.length === 0 ? <p className="zendo-text-sm zendo-text-muted">No accounts match.</p> : null}
        {people.map((person) => (
          <PersonRow key={person.id} person={person} open={open === person.id} onOpen={() => setOpen(open === person.id ? null : person.id)} act={act} />
        ))}
      </div>
    </Panel>
  );
}

function PersonRow({ person, open, onOpen, act }: { person: AdminPerson; open: boolean; onOpen: () => void; act: (body: Record<string, unknown>) => Promise<AdminView> }) {
  return (
    <article className="zendo-rounded-2xl zendo-border zendo-border-line zendo-p-3">
      <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-gap-2">
        <button type="button" className="zendo-pointer zendo-font-semibold" onClick={onOpen}>{person.displayName}</button>
        <Badge tone={person.role === "admin" ? "gold" : person.role === "user" ? "lime" : "gold"}>{person.role}</Badge>
        {person.banned ? <Badge tone="coral">paused</Badge> : null}
      </div>
      <p className="zendo-mt-1 zendo-break-all zendo-text-xs zendo-text-muted">{person.email}</p>
      {open ? (
        <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm">
          <p className="zendo-break-all zendo-font-mono zendo-text-xs">{person.address}</p>
          <p>Balance {person.zcoin} Z · staked {person.staked} Z · voting power {person.power} Z</p>
          <p>Coins created {person.coinsCreated} · trades {person.trades} · coin votes {person.coinVotes}</p>
          <div className="zendo-flex zendo-flex-wrap zendo-gap-2">
            <label className="zendo-text-sm">
              <span className="zendo-sr-only">Role for {person.displayName}</span>
              <select className="zendo-default zendo-h-9 zendo-rounded-lg zendo-border zendo-border-line zendo-bg-ink zendo-px-2" value={person.role} aria-label={`Role for ${person.displayName}`} onChange={async (event) => {
                try {
                  await act({ action: "role", id: person.id, role: event.target.value });
                  toast.success("Role saved");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not change the role.");
                }
              }}>
                {["user", "creator", "moderator", "admin"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <Button size="sm" variant={person.banned ? "primary" : "outline"} onClick={async () => {
              try {
                await act({ action: "ban", id: person.id, banned: !person.banned });
                toast.success(person.banned ? "Account restored" : "Account paused");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not update the account.");
              }
            }}>{person.banned ? "Unpause" : "Pause"}</Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function TicketPanel({ data, onChange, act }: { data: AdminView; onChange: (next: AdminView) => void; act: (body: Record<string, unknown>) => Promise<AdminView> }) {
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const fromMs = from ? Date.parse(`${from}T00:00:00`) : 0;
  const toMs = to ? Date.parse(`${to}T23:59:59`) : 0;
  const rows = (data.tickets || []).filter((ticket) => {
    if (status !== "all" && ticket.status !== status) return false;
    if (category !== "all" && ticket.category !== category) return false;
    const person = (data.people || []).find((item) => item.id === ticket.userId);
    const hay = `${ticket.displayName} ${person?.email || ""}`.toLowerCase();
    if (user && !hay.includes(user.toLowerCase())) return false;
    if (fromMs && ticket.createdAt < fromMs) return false;
    if (toMs && ticket.createdAt > toMs) return false;
    return true;
  });
  return (
    <Panel>
      <h2 className="zendo-font-semibold">Support tickets</h2>
      <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">Replies show on the account’s Support page. Desk notes stay here.</p>
      <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-sm:zendo-grid-cols-2 zendo-lg:zendo-grid-cols-3">
        <select className="zendo-default zendo-h-11 zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3" aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select className="zendo-default zendo-h-11 zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3" aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">All categories</option>
          {["Account", "Wallet", "Launchpad", "Bridge", "Other"].map((item) => <option key={item}>{item}</option>)}
        </select>
        <Input aria-label="Filter by user" placeholder="User name or email" value={user} onChange={(event) => setUser(event.target.value)} />
        <Input aria-label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Input aria-label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      <div className="zendo-desk-scroll zendo-mt-3 zendo-grid zendo-gap-3">
        {rows.length === 0 ? <p className="zendo-text-sm zendo-text-muted">No tickets in this view.</p> : null}
        {rows.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} reply={replies[ticket.id] || ""} note={notes[ticket.id] || ""} setReply={(value) => setReplies({ ...replies, [ticket.id]: value })} setNote={(value) => setNotes({ ...notes, [ticket.id]: value })} onStatus={async (next) => {
            await act({ action: "ticket-status", id: ticket.id, status: next });
            toast.success("Status saved");
          }} onReply={async () => {
            await api("/api/support", { method: "POST", body: JSON.stringify({ action: "reply", id: ticket.id, body: replies[ticket.id] || "", as: "operator" }) });
            onChange(await api<AdminView>("/api/admin"));
            setReplies({ ...replies, [ticket.id]: "" });
            toast.success("Reply saved");
          }} onNote={async () => {
            await act({ action: "ticket-note", id: ticket.id, body: notes[ticket.id] || "" });
            setNotes({ ...notes, [ticket.id]: "" });
            toast.success("Note saved");
          }} />
        ))}
      </div>
    </Panel>
  );
}

function TicketCard({ ticket, reply, note, setReply, setNote, onStatus, onReply, onNote }: {
  ticket: TicketView;
  reply: string;
  note: string;
  setReply: (value: string) => void;
  setNote: (value: string) => void;
  onStatus: (status: string) => Promise<void>;
  onReply: () => Promise<void>;
  onNote: () => Promise<void>;
}) {
  return (
    <article className="zendo-rounded-2xl zendo-border zendo-border-line zendo-p-3">
      <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-gap-2">
        <h3 className="zendo-font-semibold">{ticket.subject}</h3>
        <Badge tone={ticket.status === "closed" ? "coral" : ticket.status === "resolved" ? "lime" : "gold"}>{STATUS_LABEL[ticket.status] || ticket.status}</Badge>
        <span className="zendo-text-xs zendo-text-muted">{ticket.category} · {ticket.displayName}</span>
      </div>
      <p className="zendo-mt-2 zendo-text-sm">{ticket.body}</p>
      <div className="zendo-mt-2 zendo-grid zendo-gap-2">
        {ticket.replies.map((item) => (
          <p key={item.id} className="zendo-rounded-xl zendo-border zendo-border-line zendo-px-3 zendo-py-2 zendo-text-sm">
            <span className="zendo-font-medium">{item.from === "operator" ? "Operator" : ticket.displayName}</span>
            <span className="zendo-mt-1 zendo-block">{item.body}</span>
          </p>
        ))}
        {ticket.notes.map((item) => (
          <p key={item.id} className="zendo-rounded-xl zendo-bg-ink zendo-px-3 zendo-py-2 zendo-text-sm zendo-text-muted">Desk note · {item.actor}: {item.body}</p>
        ))}
      </div>
      <div className="zendo-mt-3 zendo-flex zendo-flex-wrap zendo-gap-2">
        <select className="zendo-default zendo-h-9 zendo-rounded-lg zendo-border zendo-border-line zendo-bg-ink zendo-px-2 zendo-text-sm" aria-label={`Status for ${ticket.subject}`} value={ticket.status} onChange={async (event) => {
          try {
            await onStatus(event.target.value);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not change the status.");
          }
        }}>
          <option value="open">Open</option>
          <option value="progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <form className="zendo-mt-2 zendo-grid zendo-gap-2" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await onReply();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save the reply.");
        }
      }}>
        <Textarea aria-label={`Reply to ${ticket.subject}`} placeholder="Reply to the account" value={reply} onChange={(event) => setReply(event.target.value)} />
        <Button type="submit" size="sm" className="zendo-justify-self-start">Send reply</Button>
      </form>
      <form className="zendo-mt-2 zendo-grid zendo-gap-2" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await onNote();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save the note.");
        }
      }}>
        <Textarea aria-label={`Desk note for ${ticket.subject}`} placeholder="Internal note" value={note} onChange={(event) => setNote(event.target.value)} />
        <Button type="submit" size="sm" variant="outline" className="zendo-justify-self-start">Save desk note</Button>
      </form>
    </article>
  );
}

function CoinPanel({ data, act }: { data: AdminView; act: (body: Record<string, unknown>) => Promise<AdminView> }) {
  const [filter, setFilter] = useState("all");
  const now = data.status.lastBlockAt || 0;
  const coins = (data.coinsMod || []).filter((coin) => {
    if (filter === "new") return now - coin.createdAt < 24 * 60 * 60 * 1000;
    if (filter === "trending") return coin.score.total > 0;
    if (filter === "reported") return coin.reportCount > 0;
    if (filter === "hidden") return coin.hidden;
    return true;
  });
  return (
    <Panel>
      <h2 className="zendo-font-semibold">Launchpad moderation</h2>
      <div className="zendo-mt-3 zendo-flex zendo-flex-wrap zendo-gap-2" role="group" aria-label="Coin filter">
        {[["all", "All"], ["new", "New"], ["trending", "Trending"], ["reported", "Reported"], ["hidden", "Hidden"]].map(([value, label]) => (
          <Button key={value} size="sm" variant={filter === value ? "primary" : "outline"} onClick={() => setFilter(value)}>{label}</Button>
        ))}
      </div>
      <div className="zendo-desk-scroll zendo-mt-3 zendo-grid zendo-gap-3">
        {coins.length === 0 ? <p className="zendo-text-sm zendo-text-muted">No coins in this view.</p> : null}
        {coins.map((coin) => <CoinRow key={coin.mint} coin={coin} act={act} />)}
      </div>
    </Panel>
  );
}

function CoinRow({ coin, act }: { coin: AdminCoin; act: (body: Record<string, unknown>) => Promise<AdminView> }) {
  return (
    <article className="zendo-rounded-2xl zendo-border zendo-border-line zendo-p-3 zendo-text-sm">
      <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-2">
        <p><Link href={`/launchpad/${coin.mint}`} className="zendo-font-semibold zendo-text-lime">{coin.symbol}</Link> · {coin.name} {coin.hidden ? "· hidden" : ""} {coin.graduated ? "· graduated" : ""}</p>
        <Button size="sm" variant={coin.hidden ? "primary" : "outline"} onClick={async () => {
          try {
            await act({ action: "hide", mint: coin.mint, hidden: !coin.hidden });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not update the coin.");
          }
        }}>{coin.hidden ? "Unhide" : "Hide"}</Button>
      </div>
      <p className="zendo-mt-2 zendo-text-muted">Reports {coin.reportCount}{coin.reports.length ? `: ${coin.reports.map((report) => `${report.reason} ${report.count}`).join(", ")}` : ""}</p>
      <p className="zendo-text-muted">Score {coin.score.total} · volume {coin.score.volume} · votes {coin.score.votes} · featured {coin.score.featured} · fresh {coin.score.fresh} · boost {coin.score.boost}</p>
      {coin.promotions.length ? (
        <div className="zendo-mt-1 zendo-text-muted">
          {coin.promotions.slice(0, 4).map((row) => <p key={`${row.at}-${row.until}`}>Promoted <TimeAgo at={row.at} /> through <TimeAgo at={row.until} /></p>)}
        </div>
      ) : <p className="zendo-text-muted">No promotion history.</p>}
    </article>
  );
}

function GovernPanel({ data }: { data: AdminView }) {
  return (
    <Panel>
      <h2 className="zendo-font-semibold">Governance, grants, and parameters</h2>
      <div className="zendo-mt-3 zendo-grid zendo-gap-4 zendo-lg:zendo-grid-cols-2">
        <div className="zendo-desk-scroll zendo-grid zendo-gap-2">
          <h3 className="zendo-text-sm zendo-font-semibold">Proposals</h3>
          {(data.proposals || []).length === 0 ? <p className="zendo-text-sm zendo-text-muted">No proposals.</p> : null}
          {(data.proposals || []).map((proposal) => (
            <p key={proposal.id} className="zendo-text-sm"><Link href={`/governance/${proposal.id}`} className="zendo-text-lime">{proposal.title}</Link> · {proposal.status} · {proposal.change} · yes {proposal.yes} / no {proposal.no}</p>
          ))}
        </div>
        <div className="zendo-desk-scroll zendo-grid zendo-gap-2">
          <h3 className="zendo-text-sm zendo-font-semibold">Treasury grants</h3>
          {(data.grants || []).length === 0 ? <p className="zendo-text-sm zendo-text-muted">No grants.</p> : null}
          {(data.grants || []).map((grant) => (
            <p key={grant.id} className="zendo-text-sm">{grant.title} · {grant.authorName} · {grant.amount} Z · {grant.status}</p>
          ))}
        </div>
      </div>
      <div className="zendo-desk-scroll zendo-mt-4 zendo-grid zendo-gap-1 zendo-text-sm zendo-text-muted">
        <h3 className="zendo-font-semibold zendo-text-cream">Live parameters</h3>
        {(data.parameters || []).map((item) => <p key={item.key}>{item.label}: {item.value}</p>)}
      </div>
    </Panel>
  );
}

function ToolsPanel() {
  const links: [string, string][] = [
    ["/ZendoDeployL1.zip", "ZendoDeployL1.zip"],
    ["/ZendoL-1_App.zip", "ZendoL-1_App.zip"],
    ["/ZendoCoin-Polygon_Mainnet.zip", "Polygon contracts"],
    ["/whitepaper", "White paper"],
    ["/cross-platform", "Cross-platform documentation"],
    ["/about", "About us"],
    ["/faq", "FAQ"],
    ["/contact", "Contact us"],
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms and conditions"],
  ];
  return (
    <Panel>
      <h2 className="zendo-font-semibold">Zendo admin tools</h2>
      <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm">
        {links.map(([href, label]) => <a key={href} href={href} className="zendo-text-lime">{label}</a>)}
      </div>
    </Panel>
  );
}
