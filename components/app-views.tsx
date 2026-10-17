"use client";

import { ArrowLeftRight, Bell, Blocks, Coins, Landmark, LifeBuoy, Send, Settings, Shield, Users, Vote, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api } from "@/lib/sdk";
import type { AdminView, NoticeRow, ProposalRow, PublicUser, TicketView, TxRow, ValidatorRow, WalletView } from "@/lib/types";
import { cn } from "@/lib/cn";
import { BrandMark, CopyButton, PaperFrame, TimeAgo } from "./chrome";
import { OperatorPanels } from "./operator-panels";
import { Badge, Button, Field, Input, LoadingPanel, Panel, Textarea } from "./ui";

const NAV = [
  { href: "/app", label: "Home", icon: Wallet },
  { href: "/launchpad", label: "Launch", icon: Coins },
  { href: "/app/send", label: "Send", icon: Send },
  { href: "/app/bridge", label: "Bridge", icon: ArrowLeftRight },
  { href: "/app/stake", label: "Stake", icon: Landmark },
  { href: "/governance", label: "Govern", icon: Vote },
  { href: "/explorer", label: "Explorer", icon: Blocks },
  { href: "/app/social", label: "Social", icon: Users },
  { href: "/app/support", label: "Support", icon: LifeBuoy },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppFrame({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [open, setOpen] = useState(false);
  const links = user.role === "admin" ? [...NAV, { href: "/app/admin", label: "Operator", icon: Shield }] : NAV;

  useEffect(() => {
    api<WalletView>("/api/wallet").then((data) => setNotices(data.notices)).catch(() => undefined);
  }, [pathname]);

  const unread = notices.filter((notice) => !notice.read).length;

  return (
    <div className="zendo-mx-auto zendo-grid zendo-max-w-6xl zendo-md:zendo-grid-cols-[220px_minmax(0,1fr)]">
      <aside className="zendo-sticky zendo-top-16 zendo-hidden zendo-h-[calc(100vh-4rem)] zendo-border-r zendo-border-line zendo-py-6 zendo-pr-4 zendo-md:zendo-block">
        <div className="zendo-px-3 zendo-pb-4">
          {pathname.startsWith("/app/admin") ? <BrandMark kind="chain" /> : <BrandMark kind="coin" />}
        </div>
        <p className="zendo-px-3 zendo-text-xs zendo-uppercase zendo-tracking-wider zendo-text-muted">{user.displayName}</p>
        <p className="zendo-mt-1 zendo-truncate zendo-px-3 zendo-font-mono zendo-text-[11px] zendo-text-muted">{user.address}</p>
        <nav className="zendo-mt-4 zendo-grid zendo-gap-1">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} className={cn("zendo-flex zendo-items-center zendo-gap-2 zendo-rounded-xl zendo-px-3 zendo-py-2 zendo-text-sm", active ? "zendo-bg-lime zendo-text-ink" : "zendo-text-muted hover:zendo-bg-white/5 hover:zendo-text-cream")}>
                <Icon className="zendo-h-4 zendo-w-4" />
                {link.label}
              </Link>
            );
          })}
          <Link href="/whitepaper" className="zendo-mt-2 zendo-flex zendo-items-center zendo-gap-2 zendo-rounded-xl zendo-px-3 zendo-py-2 zendo-text-sm zendo-text-muted hover:zendo-bg-white/5 hover:zendo-text-cream">Docs</Link>
        </nav>
      </aside>
      <div className="zendo-min-w-0 zendo-px-4 zendo-py-6 zendo-safe-pad zendo-md:zendo-pb-10">
        <div className="zendo-mb-4 zendo-flex zendo-justify-end">
          <button className="zendo-pointer zendo-relative zendo-rounded-full zendo-border zendo-border-line zendo-p-2" aria-label="Notifications" onClick={async () => {
            setOpen((value) => !value);
            if (unread) {
              const next = await api<NoticeRow[]>("/api/wallet", { method: "POST" });
              setNotices(next);
            }
          }}>
            <Bell className="zendo-h-4 zendo-w-4" />
            {unread ? <span className="zendo-absolute -zendo-right-1 -zendo-top-1 zendo-grid zendo-h-4 zendo-min-w-4 zendo-place-items-center zendo-rounded-full zendo-bg-lime zendo-px-1 zendo-text-[10px] zendo-font-bold zendo-text-ink">{unread}</span> : null}
          </button>
        </div>
        {open ? (
          <Panel className="zendo-mb-4">
            {notices.length === 0 ? <p className="zendo-text-sm zendo-text-muted">No notifications yet.</p> : null}
            <div className="zendo-grid zendo-gap-3">
              {notices.slice(0, 8).map((notice) => (
                <Link key={notice.id} href={notice.href} className="zendo-block">
                  <p className="zendo-text-sm zendo-font-medium">{notice.title}</p>
                  <p className="zendo-text-sm zendo-text-muted">{notice.body}</p>
                </Link>
              ))}
            </div>
          </Panel>
        ) : null}
        {children}
      </div>
      <nav className="zendo-safe-bottom zendo-fixed zendo-inset-x-0 zendo-bottom-0 zendo-z-30 zendo-flex zendo-gap-1 zendo-overflow-x-auto zendo-border-t zendo-border-line zendo-bg-ink/95 zendo-md:zendo-hidden">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} className={cn("zendo-grid zendo-min-w-16 zendo-shrink-0 zendo-justify-items-center zendo-gap-1 zendo-px-3 zendo-py-2 zendo-text-[11px]", active ? "zendo-text-lime" : "zendo-text-muted")}>
              <Icon className="zendo-h-4 zendo-w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function WalletHome() {
  const router = useRouter();
  const [data, setData] = useState<WalletView & { qr?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<WalletView & { qr: string }>("/api/wallet").then(setData).catch((err) => setError(err.message));
  }, []);
  if (error) return <p className="zendo-text-coral">{error}</p>;
  if (!data) return <LoadingPanel label="Loading wallet" />;
  return (
    <div className="zendo-grid zendo-gap-4">
      <BrandMark kind="coin" />
      <Panel className="zendo-shadow-soft zendo-rounded-xl zendo-bg-[radial-gradient(600px_180px_at_100%_0%,rgba(216,255,62,0.14),transparent)]">
        <p className="zendo-text-sm zendo-text-muted">Spendable ZendoCoin</p>
        <p className="num zendo-mt-1 zendo-font-display zendo-text-4xl zendo-font-bold">{data.zcoin}</p>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Pending stake rewards {data.pendingRewards} Z</p>
        <div className="zendo-mt-4 zendo-flex zendo-flex-wrap zendo-gap-2">
          <Button onClick={() => router.push("/app/send")}>Send</Button>
          <Button variant="outline" onClick={() => router.push("/app/bridge")}>Bridge</Button>
          <Button variant="outline" onClick={() => document.getElementById("receive")?.scrollIntoView({ behavior: "smooth" })}>Receive</Button>
          <Button variant="ghost" onClick={() => router.push("/app/stake")}>Stake</Button>
          <Button variant="ghost" onClick={() => router.push("/app/stake#claim")}>Claim Rewards</Button>
          <Button variant="ghost" onClick={() => router.push("/governance")}>Governance</Button>
        </div>
      </Panel>
      <div className="zendo-grid zendo-gap-4 zendo-lg:zendo-grid-cols-[1fr_220px]">
        <Panel id="receive">
          <div className="zendo-flex zendo-items-center zendo-justify-between zendo-gap-3">
            <h2 className="zendo-font-semibold">Receive</h2>
            <CopyButton value={data.user.address} label="Copy address" />
          </div>
          <p className="zendo-mt-2 zendo-break-all zendo-font-mono zendo-text-xs zendo-text-muted">{data.user.address}</p>
          <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">Referral code <span className="zendo-text-cream">{data.user.referralCode}</span> · {data.referralCount} joined</p>
        </Panel>
        {data.qr ? <Panel className="zendo-grid zendo-place-items-center"><Image src={data.qr} alt="Wallet address QR code" width={160} height={160} unoptimized className="zendo-h-40 zendo-w-40 zendo-rounded-xl" /></Panel> : null}
      </div>
      <Panel>
        <h2 className="zendo-font-semibold">Resources</h2>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">The white paper is the supply, vesting, and fee reference for this release. It lives under Docs on this wallet.</p>
        <div className="zendo-mt-3 zendo-flex zendo-flex-wrap zendo-gap-4 zendo-text-sm">
          <Link href="/onboarding" className="zendo-text-lime">Read onboarding</Link>
          <Link href="/whitepaper" className="zendo-text-lime">Open the white paper</Link>
        </div>
      </Panel>
      <PaperFrame />
      <Panel>
        <h2 className="zendo-font-semibold">Tokens</h2>
        <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm">
          {data.tokens.length === 0 ? <p className="zendo-text-muted">No launchpad tokens yet. The curve is one trade away.</p> : null}
          {data.tokens.map((token) => (
            <Link key={token.mint} href={`/launchpad/${token.mint}`} className="zendo-flex zendo-items-center zendo-justify-between zendo-rounded-xl zendo-px-2 zendo-py-2 hover:zendo-bg-white/5">
              <span>{token.emoji} {token.symbol}</span>
              <span className="num zendo-text-muted">{token.amount} · {token.value} Z</span>
            </Link>
          ))}
        </div>
      </Panel>
      <Panel>
        <h2 className="zendo-font-semibold">Synthetic assets</h2>
        <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm">
          {data.synthetics.length === 0 ? <p className="zendo-text-muted">No wrapped balance yet. A mint lands only after confirmed external events agree.</p> : null}
          {data.synthetics.map((token) => (
            <p key={token.id} className="zendo-flex zendo-items-center zendo-justify-between zendo-rounded-xl zendo-px-2 zendo-py-2">
              <span>{token.id}</span>
              <span className="num zendo-text-muted">{token.amount}</span>
            </p>
          ))}
        </div>
      </Panel>
      <TxList txs={data.txs} />
    </div>
  );
}

export function SendForm() {
  const router = useRouter();
  const [form, setForm] = useState({ to: "", token: "ZCOIN", amount: "" });
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const tx = await api<TxRow>("/api/wallet/send", { method: "POST", body: JSON.stringify(form) });
      toast.success("Transfer included");
      router.push(`/explorer/tx/${tx.hash}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed.");
      setBusy(false);
    }
  }
  return (
    <form className="zendo-grid zendo-max-w-xl zendo-gap-4" onSubmit={submit}>
      <Field label="Recipient" hint="A znd1 address. A new address is recorded on this chain when the transfer is included.">
        <Input value={form.to} onChange={(event) => { const to = event.target.value.trim(); setForm((current) => ({ ...current, to })); }} required />
      </Field>
      <Field label="Token" hint="ZCOIN or a launchpad ticker.">
        <Input value={form.token} onChange={(event) => { const token = event.target.value; setForm((current) => ({ ...current, token })); }} required />
      </Field>
      <Field label="Amount" hint="Network fee is 0.001 ZCoin, paid in ZCoin.">
        <Input inputMode="decimal" value={form.amount} onChange={(event) => { const amount = event.target.value; setForm((current) => ({ ...current, amount })); }} required />
      </Field>
      <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send"}</Button>
    </form>
  );
}

type BridgeDeskView = {
  configured: boolean;
  polygonBridge: string | null;
  signer: string | null;
  chainId: number;
  vault: string;
  vaultZ: string;
  fee: string;
  admin: boolean;
  withdrawals: { id: string; nonce: number; recipient: string; amount: string; amountDisplay: string; signature: string; bridge: string; chainId: number; txHash: string }[];
  deposits: { id: string; amountDisplay: string; polygonTx: string; txHash: string }[];
};

export function BridgeDesk() {
  const [data, setData] = useState<BridgeDeskView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState({ recipient: "", amount: "" });
  const [txHash, setTxHash] = useState("");
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<BridgeDeskView>("/api/bridge").then(setData).catch((err) => setError(err instanceof Error ? err.message : "Could not load the bridge."));
  }, []);

  async function run(body: Record<string, string>) {
    setBusy(true);
    try {
      setData(await api<BridgeDeskView>("/api/bridge", { method: "POST", body: JSON.stringify(body) }));
      toast.success("Bridge updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bridge request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="zendo-text-coral">{error}</p>;
  if (!data) return <LoadingPanel label="Loading the bridge" />;

  return (
    <div className="zendo-grid zendo-gap-4">
      <Panel>
        <p className="zendo-text-sm zendo-text-muted">Vault available for deposits</p>
        <p className="num zendo-text-2xl zendo-font-semibold">{data.vaultZ} Z</p>
        <p className="zendo-mt-2 zendo-break-all zendo-font-mono zendo-text-xs zendo-text-muted">{data.vault}</p>
        <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">
          {data.configured ? `Signer ${data.signer} · Polygon chain ${data.chainId} · contract ${data.polygonBridge}` : "This node has no bridge signer yet. A withdrawal will not lock coins until ZENDO_POLYGON_BRIDGE and ZENDO_BRIDGE_PRIVATE_KEY are set."}
        </p>
      </Panel>
      <form className="zendo-grid zendo-max-w-xl zendo-gap-4" onSubmit={(event) => { event.preventDefault(); void run({ action: "withdraw", recipient: withdraw.recipient, amount: withdraw.amount }); }}>
        <Field label="Polygon recipient" hint="The 0x address that will call release() or receive the ERC-20.">
          <Input value={withdraw.recipient} onChange={(event) => { const recipient = event.target.value.trim(); setWithdraw((current) => ({ ...current, recipient })); }} required />
        </Field>
        <Field label="Amount" hint={`Locks this many Z. Network fee is ${data.fee} Z on top. There is no refund after the voucher is signed.`}>
          <Input inputMode="decimal" value={withdraw.amount} onChange={(event) => { const amount = event.target.value; setWithdraw((current) => ({ ...current, amount })); }} required />
        </Field>
        <Button type="submit" disabled={busy}>{busy ? "Signing…" : "Withdraw to Polygon"}</Button>
      </form>
      <form className="zendo-grid zendo-max-w-xl zendo-gap-4" onSubmit={(event) => { event.preventDefault(); void run({ action: "deposit", txHash }); }}>
        <Field label="Polygon lock transaction" hint="The hash of lock(). This node reads the log. It does not accept an amount from the browser.">
          <Input value={txHash} onChange={(event) => setTxHash(event.target.value.trim())} required />
        </Field>
        <Button type="submit" variant="outline" disabled={busy}>Deposit into Zendo</Button>
      </form>
      {data.admin ? (
        <form className="zendo-grid zendo-max-w-xl zendo-gap-4" onSubmit={(event) => { event.preventDefault(); void run({ action: "seed", amount: seed }); }}>
          <Field label="Seed the vault" hint="Moves Z from the operator wallet into the vault so deposits can be paid. It does not sign a Polygon voucher.">
            <Input inputMode="decimal" value={seed} onChange={(event) => setSeed(event.target.value)} required />
          </Field>
          <Button type="submit" variant="ghost" disabled={busy}>Seed vault</Button>
        </form>
      ) : null}
      <Panel>
        <h2 className="zendo-font-semibold">Your vouchers</h2>
        {data.withdrawals.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">No signed withdrawals yet.</p> : null}
        <div className="zendo-mt-3 zendo-grid zendo-gap-3">
          {data.withdrawals.map((row) => (
            <div key={row.id} className="zendo-rounded-xl zendo-bg-ink zendo-p-3 zendo-text-xs">
              <p>{row.amountDisplay} Z · nonce {row.nonce} · chain {row.chainId}</p>
              <p className="zendo-mt-1 zendo-break-all zendo-font-mono zendo-text-muted">to {row.recipient}</p>
              <p className="zendo-mt-1 zendo-break-all zendo-font-mono zendo-text-muted">bridge {row.bridge}</p>
              <p className="zendo-mt-1 zendo-break-all zendo-font-mono zendo-text-muted">amount {row.amount}</p>
              <p className="zendo-mt-1 zendo-break-all zendo-font-mono">{row.signature}</p>
              <Link href={`/explorer/tx/${row.txHash}`} className="zendo-mt-2 zendo-inline-block zendo-text-lime">View lock</Link>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <h2 className="zendo-font-semibold">Deposits</h2>
        {data.deposits.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">No deposits credited yet.</p> : null}
        <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm">
          {data.deposits.map((row) => (
            <div key={row.id} className="zendo-flex zendo-flex-wrap zendo-justify-between zendo-gap-2">
              <span>{row.amountDisplay} Z</span>
              <Link href={`/explorer/tx/${row.txHash}`} className="zendo-text-lime">Ledger</Link>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function StakeDesk() {
  const [rows, setRows] = useState<ValidatorRow[] | null>(null);
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ validators: ValidatorRow[]; wallet: WalletView | null; apr: number; unbondingBlocks: number }>("/api/stake/view")
      .then((data) => {
        setRows(data.validators);
        setWallet(data.wallet);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load validators."));
  }, []);

  if (error) return <p className="zendo-text-coral">{error}</p>;
  if (!rows) return <LoadingPanel label="Loading validators" />;

  return (
    <div className="zendo-grid zendo-gap-4">
      {wallet ? (
        <Panel id="claim">
          <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-3">
            <div>
              <p className="zendo-text-sm zendo-text-muted">Claimable after commission</p>
              <p className="num zendo-text-2xl zendo-font-semibold">{wallet.pendingRewards} Z</p>
            </div>
            <Button onClick={async () => {
              try {
                const next = await api<WalletView>("/api/stake/claim", { method: "POST", body: JSON.stringify({ stakeId: "all" }) });
                setWallet(next);
                toast.success("Rewards claimed");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Nothing to claim.");
              }
            }}>Claim Rewards</Button>
          </div>
          <div className="zendo-mt-4 zendo-grid zendo-gap-2 zendo-text-sm">
            {wallet.stakes.length === 0 ? <p className="zendo-text-muted">You have not delegated yet.</p> : null}
            {wallet.stakes.map((stake) => (
              <div key={stake.id} className="zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-2 zendo-rounded-xl zendo-bg-ink zendo-px-3 zendo-py-2">
                <span>{stake.moniker} · {stake.amount} Z</span>
                <Button size="sm" variant="outline" onClick={async () => {
                  const amount = window.prompt(`Unbond how much of ${stake.amount}?`, stake.amount.replace(/,/g, ""));
                  if (!amount) return;
                  try {
                    const next = await api<WalletView>("/api/stake/undelegate", { method: "POST", body: JSON.stringify({ stakeId: stake.id, amount }) });
                    setWallet(next);
                    toast.success("Unbonding started");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Unstake failed.");
                  }
                }}>Unbond</Button>
              </div>
            ))}
            {wallet.unbonding.map((row) => (
              <p key={row.id} className="zendo-text-muted">{row.amount} Z unbonding until block {row.readyHeight}{row.ready ? " (ready)" : ""}</p>
            ))}
          </div>
        </Panel>
      ) : null}
      <div className="zendo-grid zendo-gap-3">
        {rows.map((validator) => (
          <Panel key={validator.id} className="zendo-grid zendo-gap-3 zendo-md:zendo-grid-cols-[1fr_auto] zendo-md:zendo-items-center">
            <div>
              <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-gap-2">
                <h2 className="zendo-font-semibold">{validator.moniker}</h2>
                <Badge tone={validator.status === "active" ? "lime" : validator.status === "jailed" ? "coral" : "gold"}>{validator.status}</Badge>
              </div>
              <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">{validator.region} · commission {validator.commission}% · uptime {validator.uptime}% · net APR {validator.apr}%</p>
              <p className="zendo-text-sm zendo-text-muted">Self stake {validator.selfStake} · delegated {validator.delegated} · proposed {validator.proposed}</p>
            </div>
            {validator.status === "active" && wallet ? (
              <div className="zendo-flex zendo-gap-2">
                <Input className="zendo-w-28" placeholder="Amount" value={amounts[validator.id] || ""} onChange={(event) => setAmounts({ ...amounts, [validator.id]: event.target.value })} />
                <Button onClick={async () => {
                  try {
                    const next = await api<WalletView>("/api/stake/delegate", { method: "POST", body: JSON.stringify({ validatorId: validator.id, amount: amounts[validator.id] }) });
                    setWallet(next);
                    toast.success(`Delegated to ${validator.moniker}`);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not delegate.");
                  }
                }}>Delegate</Button>
              </div>
            ) : null}
          </Panel>
        ))}
      </div>
    </div>
  );
}

type PrefName = "theme" | "font" | "contrast";

const PREF_KEYS: Record<PrefName, string> = { theme: "zendo-theme", font: "zendo-font", contrast: "zendo-contrast" };
const prefListeners = new Set<() => void>();

function emitPrefs() {
  for (const listener of prefListeners) listener();
}

function subscribePrefs(listener: () => void) {
  prefListeners.add(listener);
  if (typeof window !== "undefined") window.addEventListener("storage", listener);
  return () => {
    prefListeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", listener);
  };
}

function readPref(name: PrefName, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(PREF_KEYS[name]) || fallback;
}

function applyPref(name: PrefName, value: string) {
  const root = document.documentElement;
  if (name === "font") {
    if (value === "100") delete root.dataset.font;
    else root.dataset.font = value;
    return;
  }
  if (name === "contrast") {
    if (value === "standard") delete root.dataset.contrast;
    else root.dataset.contrast = value;
    return;
  }
  root.dataset.theme = value;
}

function writePref(name: PrefName, value: string) {
  window.localStorage.setItem(PREF_KEYS[name], value);
  applyPref(name, value);
  emitPrefs();
}

export function SettingsForm({ user }: { user: PublicUser }) {
  const router = useRouter();
  const [password, setPassword] = useState({ current: "", next: "" });
  const [pin, setPin] = useState({ current: "", next: "" });
  const theme = useSyncExternalStore(subscribePrefs, () => readPref("theme", "dark"), () => "dark");
  const font = useSyncExternalStore(subscribePrefs, () => readPref("font", "100"), () => "100");
  const contrast = useSyncExternalStore(subscribePrefs, () => readPref("contrast", "standard"), () => "standard");
  useEffect(() => {
    applyPref("theme", theme);
    applyPref("font", font);
    applyPref("contrast", contrast);
  }, [theme, font, contrast]);
  async function downloadHistory(format: "json" | "csv") {
    try {
      const result = await api<{ url: string }>("/api/wallet/history", { method: "POST", body: JSON.stringify({ format }) });
      window.location.assign(result.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare the download.");
    }
  }
  return (
    <div className="zendo-grid zendo-max-w-xl zendo-gap-4">
      <Panel className="zendo-grid zendo-gap-3">
        <h2 className="zendo-font-semibold">Display</h2>
        <p className="zendo-text-sm zendo-text-muted">Saved on this device. Dark is the default.</p>
        <div className="zendo-flex zendo-flex-wrap zendo-gap-2" role="group" aria-label="Color theme">
          {(["dark", "light"] as const).map((value) => (
            <Button key={value} type="button" size="sm" variant={theme === value ? "primary" : "outline"} onClick={() => writePref("theme", value)}>{value === "dark" ? "Dark" : "Light"}</Button>
          ))}
        </div>
        <div className="zendo-flex zendo-flex-wrap zendo-gap-2" role="group" aria-label="Text size">
          {([["100", "Standard"], ["112", "Large"], ["125", "Larger"]] as const).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={font === value ? "primary" : "outline"} onClick={() => writePref("font", value)}>{label}</Button>
          ))}
        </div>
        <div className="zendo-flex zendo-flex-wrap zendo-gap-2" role="group" aria-label="Contrast">
          {([["standard", "Standard contrast"], ["high", "High contrast"]] as const).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={contrast === value ? "primary" : "outline"} onClick={() => writePref("contrast", value)}>{label}</Button>
          ))}
        </div>
      </Panel>
      <Panel className="zendo-grid zendo-gap-3">
        <h2 className="zendo-font-semibold">Download My History</h2>
        <p className="zendo-text-sm zendo-text-muted">Transactions, staking, governance, and meme-coin activity for this wallet. The file downloads in the browser or the wrapper. Zendo does not email it.</p>
        <div className="zendo-flex zendo-flex-wrap zendo-gap-2">
          <Button type="button" size="sm" onClick={() => downloadHistory("json")}>Download My History</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => downloadHistory("csv")}>Download CSV</Button>
        </div>
      </Panel>
      <Panel>
        <p className="zendo-text-sm zendo-text-muted">Address</p>
        <p className="zendo-mt-1 zendo-break-all zendo-font-mono zendo-text-xs">{user.address}</p>
        <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">Referral code</p>
        <p className="zendo-font-semibold">{user.referralCode}</p>
        <CopyButton value={`${typeof window !== "undefined" ? window.location.origin : ""}/signup?ref=${user.referralCode}`} label="Copy invite link" />
        <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">The 12-word phrase is not stored. Use the recover page if you still have it.</p>
      </Panel>
      <form className="zendo-grid zendo-gap-3" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await api("/api/auth/password", { method: "POST", body: JSON.stringify(password) });
          toast.success("Password updated");
          setPassword({ current: "", next: "" });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not change password.");
        }
      }}>
        <Panel className="zendo-grid zendo-gap-3">
          <h2 className="zendo-font-semibold">Change password</h2>
          <Input type="password" placeholder="Current password" value={password.current} onChange={(event) => { const current = event.target.value; setPassword((prev) => ({ ...prev, current })); }} />
          <Input type="password" placeholder="New password" value={password.next} onChange={(event) => { const next = event.target.value; setPassword((prev) => ({ ...prev, next })); }} />
          <Button type="submit" size="sm" className="zendo-justify-self-start">Update password</Button>
        </Panel>
      </form>
      <form className="zendo-grid zendo-gap-3" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await api("/api/auth/pin-change", { method: "POST", body: JSON.stringify(pin) });
          toast.success("PIN updated");
          setPin({ current: "", next: "" });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not change PIN.");
        }
      }}>
        <Panel className="zendo-grid zendo-gap-3">
          <h2 className="zendo-font-semibold">Change PIN</h2>
          <Input inputMode="numeric" maxLength={4} placeholder="Current PIN" value={pin.current} onChange={(event) => { const current = event.target.value; setPin((prev) => ({ ...prev, current })); }} />
          <Input inputMode="numeric" maxLength={4} placeholder="New PIN" value={pin.next} onChange={(event) => { const next = event.target.value; setPin((prev) => ({ ...prev, next })); }} />
          <Button type="submit" size="sm" variant="outline" className="zendo-justify-self-start">Update PIN</Button>
        </Panel>
      </form>
      <Panel className="zendo-grid zendo-gap-2">
        <h2 className="zendo-font-semibold">Session</h2>
        <p className="zendo-text-sm zendo-text-muted">Sign out clears the session cookie on this node.</p>
        <Button variant="outline" className="zendo-justify-self-start" onClick={async () => {
          await api("/api/auth/signout", { method: "POST" });
          router.push("/");
          router.refresh();
        }}>Sign out</Button>
      </Panel>
    </div>
  );
}

export function GovernDesk({ focusId }: { focusId?: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ProposalRow[] | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "", key: "trade_bps", value: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<ProposalRow[]>("/api/governance"),
      api<{ user: PublicUser | null }>("/api/auth/me"),
    ])
      .then(([list, me]) => {
        setRows(list);
        setUser(me.user);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load proposals."));
  }, []);
  if (error) return <p className="zendo-text-coral">{error}</p>;
  if (!rows) return <LoadingPanel label="Loading proposals" />;
  const shown = focusId ? rows.filter((proposal) => proposal.id === focusId) : rows;
  return (
    <div className="zendo-grid zendo-gap-4">
      {focusId ? <Link href="/governance" className="zendo-text-sm zendo-text-lime">All proposals</Link> : null}
      {focusId && shown.length === 0 ? <Panel>That proposal is not on this chain.</Panel> : null}
      {!focusId && user ? (
        <form className="zendo-grid zendo-gap-3" onSubmit={async (event) => {
          event.preventDefault();
          try {
            const next = await api<ProposalRow[]>("/api/governance", { method: "POST", body: JSON.stringify(draft) });
            setRows(next);
            setDraft({ title: "", body: "", key: "trade_bps", value: "" });
            toast.success("Proposal recorded");
            if (next[0]) router.push(`/governance/${next[0].id}`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not propose.");
          }
        }}>
          <Panel className="zendo-grid zendo-gap-3">
            <h2 className="zendo-font-semibold">New proposal</h2>
            <p className="zendo-text-sm zendo-text-muted">Costs 1 ZCoin. You need 100 ZCoin of voting power. A passing vote writes the parameter into the live chain config.</p>
            <Input placeholder="Title" value={draft.title} onChange={(event) => { const title = event.target.value; setDraft((current) => ({ ...current, title })); }} />
            <Textarea placeholder="Why this parameter should change" value={draft.body} onChange={(event) => { const body = event.target.value; setDraft((current) => ({ ...current, body })); }} />
            <label className="zendo-grid zendo-gap-1 zendo-text-sm">
              <span className="zendo-text-muted">Parameter</span>
              <select className="zendo-default zendo-h-11 zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3" value={draft.key} onChange={(event) => { const key = event.target.value; setDraft((current) => ({ ...current, key })); }}>
                <option value="block_time_ms">Block time (ms)</option>
                <option value="finality_depth">Finality depth</option>
                <option value="trade_bps">Trade fee (basis points)</option>
                <option value="creator_bps">Creator share (basis points)</option>
                <option value="apr_bps">Staking APR (basis points)</option>
                <option value="graduation_z">Graduation reserves (ZCoin)</option>
                <option value="min_delegate">Minimum stake (ZCoin)</option>
                <option value="unbonding_blocks">Unbonding blocks</option>
                <option value="mev">MEV skim (on or off)</option>
                <option value="gas_transfer">Transfer fee</option>
                <option value="gas_trade">Trade gas</option>
                <option value="gas_vote">Vote fee</option>
                <option value="gas_stake">Stake fee</option>
                <option value="gas_proposal">Proposal fee</option>
                <option value="gas_create_coin">Coin creation fee</option>
                <option value="gas_promote">Promotion fee</option>
              </select>
            </label>
            <Input placeholder="New value" value={draft.value} onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, value })); }} />
            <Button type="submit" size="sm" className="zendo-justify-self-start zendo-bg-gold zendo-text-dark">Create Proposal</Button>
          </Panel>
        </form>
      ) : null}
      {!user ? (
        <Panel>Log in to vote with your ZCoin balance and stake. <Link href={`/signin?next=${focusId ? `/governance/${focusId}` : "/governance"}`} className="zendo-text-lime">Log In</Link></Panel>
      ) : null}
      {shown.map((proposal) => (
        <Panel key={proposal.id}>
          <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-gap-2">
            {focusId ? <h2 className="zendo-font-semibold">{proposal.title}</h2> : <Link href={`/governance/${proposal.id}`} className="zendo-font-semibold hover:zendo-text-lime">{proposal.title}</Link>}
            <Badge tone={proposal.status === "passed" ? "lime" : proposal.status === "rejected" ? "coral" : "gold"}>{proposal.status}</Badge>
          </div>
          <p className="zendo-mt-2 zendo-text-sm zendo-leading-6 zendo-text-muted">{proposal.body}</p>
          {proposal.change ? <p className="zendo-mt-2 zendo-text-sm zendo-text-cream">Chain parameter: {proposal.change}</p> : null}
          <p className="zendo-mt-2 zendo-text-xs zendo-text-muted">{proposal.authorName} · ends <TimeAgo at={proposal.endsAt} /> · quorum {proposal.quorumMet ? "met" : "open"}</p>
          <div className="zendo-mt-3 zendo-h-2 zendo-overflow-hidden zendo-rounded-full zendo-bg-ink">
            <div className="zendo-h-full zendo-bg-lime" style={{ width: `${proposal.yesPct}%` }} />
          </div>
          <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Yes {proposal.yes} · No {proposal.no} · Abstain {proposal.abstain}</p>
          {user && proposal.status === "active" ? (
            <div className="zendo-mt-3 zendo-flex zendo-gap-2">
              {([
                ["yes", "Vote Yes", "zendo-bg-gold zendo-text-dark"],
                ["no", "Vote No", ""],
                ["abstain", "Abstain", ""],
              ] as const).map(([choice, label, tone]) => (
                <Button key={choice} size="sm" variant={proposal.yourVote === choice ? "primary" : "outline"} className={tone} onClick={async () => {
                  try {
                    const next = await api<ProposalRow[]>(`/api/governance/${proposal.id}`, { method: "POST", body: JSON.stringify({ choice }) });
                    setRows(next);
                    toast.success("Vote recorded");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Vote failed.");
                  }
                }}>{label}</Button>
              ))}
            </div>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

export function AdminDesk() {
  const [data, setData] = useState<AdminView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  async function load() {
    setData(await api<AdminView>("/api/admin"));
  }
  useEffect(() => {
    api<AdminView>("/api/admin")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the node desk."));
  }, []);
  if (error) return <p className="zendo-text-coral">{error}</p>;
  if (!data) return <LoadingPanel label="Loading the operator desk" />;
  return (
    <div className="zendo-grid zendo-gap-4">
      <BrandMark kind="chain" />
      <div className="zendo-grid zendo-gap-3 zendo-sm:zendo-grid-cols-4">
        <Stat k="Height" v={String(data.status.height)} />
        <Stat k="Finalized" v={String(data.status.finalizedHeight)} />
        <Stat k="Mempool" v={String(data.status.mempool)} />
        <Stat k="Users" v={String(data.users)} />
      </div>
      <OperatorPanels data={data} onChange={setData} />
      <Panel>
        <h2 className="zendo-font-semibold">Region labels on this node</h2>
        <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm">
          {data.peers.map((peer) => (
            <div key={peer.id} className="zendo-flex zendo-justify-between zendo-gap-3 zendo-text-muted">
              <span>{peer.region}</span>
              <span className="num">{peer.latencyMs.toFixed(0)} ms · {peer.version}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-3">
          <div>
            <h2 className="zendo-font-semibold">Optional MEV skim</h2>
            <p className="zendo-text-sm zendo-text-muted">Adds 0.05% to the protocol side of a trade. It is off unless you switch it on. Recorded revenue: {data.revenue.mev} Z.</p>
          </div>
          <Button variant={data.mevEnabled ? "primary" : "outline"} onClick={async () => {
            setData(await api<AdminView>("/api/admin", { method: "POST", body: JSON.stringify({ action: "mev", enabled: !data.mevEnabled }) }));
          }}>{data.mevEnabled ? "MEV on" : "MEV off"}</Button>
        </div>
        <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">Gas {data.revenue.gas} · trade {data.revenue.trade} · create {data.revenue.create} · promote {data.revenue.promote}</p>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">Rejected: insufficient {data.counters.insufficient}, malformed {data.counters.malformed}, bad signatures {data.counters.signature}. Forks kept: {data.forksResolved}.</p>
        <Button className="zendo-mt-3" size="sm" variant="outline" onClick={async () => {
          const result = await api<{ reason: string }>("/api/admin", { method: "POST", body: JSON.stringify({ action: "fork" }) });
          toast.success(result.reason);
          await load();
        }}>Run fork-choice drill</Button>
      </Panel>
      <Panel className="zendo-border-lime">
        <h2 className="zendo-font-semibold">Validators</h2>
        <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">Jailing slashes 10% of self-stake and delegations into the treasury. Rewards pause until the validator is active again. The slash stays.</p>
        <div className="zendo-mt-3 zendo-grid zendo-gap-2">
          {data.validators.map((validator) => (
            <div key={validator.id} className="zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-2 zendo-text-sm">
              <span><Link href={`/explorer/validators/${validator.id}`} className="zendo-text-lime">{validator.moniker}</Link> · {validator.status}</span>
              <span className="zendo-flex zendo-gap-2">
                {validator.status !== "active" ? <Button size="sm" className="zendo-text-ink" onClick={() => act({ action: "validator", id: validator.id, status: "active" })}>Approve validator</Button> : null}
                {validator.status !== "jailed" ? <Button size="sm" variant="outline" onClick={() => act({ action: "validator", id: validator.id, status: "jailed" })}>Jail validator</Button> : null}
              </span>
            </div>
          ))}
        </div>
        {data.slashes.length ? (
          <div className="zendo-mt-3 zendo-grid zendo-gap-1 zendo-text-sm zendo-text-muted">
            {data.slashes.map((slash) => (
              <p key={slash.id}>{slash.moniker} · {slash.amount} Z · {slash.reason}</p>
            ))}
          </div>
        ) : null}
      </Panel>
      <Panel>
        <h2 className="zendo-font-semibold">Reports</h2>
        {data.reports.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">No reports.</p> : null}
        {data.reports.map((report) => (
          <div key={report.id} className="zendo-mt-3 zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-2 zendo-text-sm">
            <span>{report.symbol} · {report.reason} {report.open ? "" : "(closed)"}</span>
            <Button size="sm" variant="danger" onClick={() => act({ action: "hide", mint: report.mint, hidden: true })}>Hide coin</Button>
          </div>
        ))}
      </Panel>
      <Panel>
        <h2 className="zendo-font-semibold">Premium RPC</h2>
        <div className="zendo-mt-3 zendo-flex zendo-gap-2">
          <Input placeholder="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Button onClick={() => act({ action: "premium", email, premium: true })}>Grant</Button>
          <Button variant="outline" onClick={() => act({ action: "premium", email, premium: false })}>Remove</Button>
        </div>
      </Panel>
      <Panel>
        <h2 className="zendo-font-semibold">Reset-link outbox</h2>
        {data.mailbox.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">No reset links yet.</p> : null}
        {data.mailbox.map((mail) => (
          <p key={mail.id} className="zendo-mt-2 zendo-break-all zendo-text-sm zendo-text-muted">{mail.to}: {mail.link}</p>
        ))}
      </Panel>
      <Panel>
        <h2 className="zendo-font-semibold">Contact</h2>
        {data.contacts.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">No messages.</p> : null}
        {data.contacts.map((note) => (
          <div key={note.id} className="zendo-mt-3 zendo-text-sm">
            <p className="zendo-font-medium">{note.name} · {note.topic}</p>
            <p className="zendo-text-muted">{note.email}</p>
            <p className="zendo-mt-1">{note.message}</p>
          </div>
        ))}
      </Panel>
      <Panel>
        <h2 className="zendo-font-semibold">Audit log</h2>
        <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm zendo-text-muted">
          {data.audit.map((row) => (
            <p key={row.id}><TimeAgo at={row.at} /> · {row.actor} · {row.action} · {row.detail}</p>
          ))}
        </div>
      </Panel>
    </div>
  );

  async function act(body: Record<string, unknown>) {
    try {
      setData(await api<AdminView>("/api/admin", { method: "POST", body: JSON.stringify(body) }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    }
  }
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <Panel>
      <p className="zendo-text-xs zendo-text-muted">{k}</p>
      <p className="num zendo-mt-1 zendo-text-2xl zendo-font-semibold">{v}</p>
    </Panel>
  );
}

export function TxList({ txs }: { txs: TxRow[] }) {
  return (
    <Panel>
      <h2 className="zendo-font-semibold">Activity</h2>
      <div className="zendo-mt-3 zendo-grid zendo-gap-2">
        {txs.length === 0 ? <p className="zendo-text-sm zendo-text-muted">No transactions yet.</p> : null}
        {txs.map((tx) => (
          <Link key={tx.hash} href={`/explorer/tx/${tx.hash}`} className="zendo-flex zendo-items-center zendo-justify-between zendo-gap-3 zendo-rounded-xl zendo-px-2 zendo-py-2 zendo-text-sm hover:zendo-bg-white/5">
            <span className="zendo-truncate">{tx.summary}</span>
            <span className="zendo-shrink-0 zendo-text-muted"><TimeAgo at={tx.at} /></span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

const TICKET_CATEGORIES = ["Account", "Wallet", "Launchpad", "Bridge", "Other"];

function TicketList({
  rows,
  replies,
  setReplies,
  onReply,
  showName,
}: {
  rows: TicketView[];
  replies: Record<string, string>;
  setReplies: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  onReply: (id: string) => Promise<void>;
  showName?: boolean;
}) {
  if (rows.length === 0) return <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">No tickets in this view.</p>;
  return (
    <div className="zendo-mt-3 zendo-grid zendo-gap-4">
      {rows.map((ticket) => (
        <article key={ticket.id} className="zendo-rounded-2xl zendo-border zendo-border-line zendo-p-3">
          <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-gap-2">
            <h3 className="zendo-font-semibold">{ticket.subject}</h3>
            <Badge tone={ticket.status === "resolved" ? "lime" : ticket.status === "closed" ? "coral" : "gold"}>{{ open: "Open", progress: "In Progress", resolved: "Resolved", closed: "Closed" }[ticket.status] || ticket.status}</Badge>
            <span className="zendo-text-xs zendo-text-muted">{ticket.category}</span>
          </div>
          {showName ? <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">{ticket.displayName}</p> : null}
          <p className="zendo-mt-2 zendo-text-sm zendo-leading-6">{ticket.body}</p>
          {ticket.attachmentData && ticket.attachmentName ? (
            <a className="zendo-mt-2 zendo-inline-block zendo-text-sm zendo-text-lime" href={ticket.attachmentData}>{ticket.attachmentName}</a>
          ) : null}
          <div className="zendo-mt-3 zendo-grid zendo-gap-2">
            {ticket.replies.map((reply) => (
              <p key={reply.id} className="zendo-rounded-xl zendo-bg-ink zendo-px-3 zendo-py-2 zendo-text-sm">
                <span className="zendo-font-medium">{reply.from === "operator" ? "Operator" : showName ? ticket.displayName : "You"}</span>
                <span className="zendo-text-muted"> · <TimeAgo at={reply.at} /></span>
                <span className="zendo-mt-1 zendo-block">{reply.body}</span>
              </p>
            ))}
          </div>
          {ticket.status === "closed" ? <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">This ticket is closed.</p> : (
          <form className="zendo-mt-3 zendo-grid zendo-gap-2" onSubmit={async (event) => {
            event.preventDefault();
            try {
              await onReply(ticket.id);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not save the reply.");
            }
          }}>
            <Textarea aria-label={`Reply to ${ticket.subject}`} placeholder="Reply" value={replies[ticket.id] || ""} onChange={(event) => setReplies((current) => ({ ...current, [ticket.id]: event.target.value }))} />
            <Button type="submit" size="sm" className="zendo-justify-self-start">Send reply</Button>
          </form>
          )}
        </article>
      ))}
    </div>
  );
}

export function SupportDesk() {
  const [tickets, setTickets] = useState<TicketView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", category: "Account", body: "" });
  const [attachment, setAttachment] = useState<{ attachmentName: string; attachmentType: string; attachmentData: string } | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  useEffect(() => {
    api<{ tickets: TicketView[] }>("/api/support").then((data) => setTickets(data.tickets)).catch((err) => setError(err.message));
  }, []);
  if (error) return <p className="zendo-text-coral">{error}</p>;
  if (!tickets) return <LoadingPanel label="Loading support tickets" />;
  return (
    <div className="zendo-grid zendo-gap-4">
      <form className="zendo-grid zendo-gap-3" onSubmit={async (event) => {
        event.preventDefault();
        try {
          const next = await api<{ tickets: TicketView[] }>("/api/support", {
            method: "POST",
            body: JSON.stringify({ ...form, ...(attachment || {}) }),
          });
          setTickets(next.tickets);
          setForm({ subject: "", category: "Account", body: "" });
          setAttachment(null);
          toast.success("Ticket saved on this node");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save the ticket.");
        }
      }}>
        <Panel className="zendo-grid zendo-gap-3">
          <h2 className="zendo-font-semibold">New ticket</h2>
          <p className="zendo-text-sm zendo-text-muted">Replies show on this page. Nothing is emailed.</p>
          <Field label="Subject"><Input value={form.subject} onChange={(event) => { const subject = event.target.value; setForm((current) => ({ ...current, subject })); }} required /></Field>
          <Field label="Category">
            <select className="zendo-default zendo-h-11 zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3 zendo-text-sm" value={form.category} onChange={(event) => { const category = event.target.value; setForm((current) => ({ ...current, category })); }}>
              {TICKET_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
          </Field>
          <Field label="Description"><Textarea value={form.body} onChange={(event) => { const body = event.target.value; setForm((current) => ({ ...current, body })); }} required /></Field>
          <Field label="Attachment" hint="Optional. PNG, JPEG, WebP, PDF, or text. 120 KB max.">
            <Input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                setAttachment(null);
                return;
              }
              if (file.size > 120 * 1024) {
                toast.error("Attachments stay under 120 KB.");
                event.target.value = "";
                return;
              }
              const buffer = await file.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = "";
              for (const byte of bytes) binary += String.fromCharCode(byte);
              const attachmentName = (file.name.split(/[/\\]/).pop() || "file").replace(/[^A-Za-z0-9._ -]/g, "").slice(0, 80);
              setAttachment({ attachmentName, attachmentType: file.type, attachmentData: btoa(binary) });
            }} />
          </Field>
          <Button type="submit" className="zendo-justify-self-start">Submit ticket</Button>
        </Panel>
      </form>
      <TicketList
        rows={tickets}
        replies={replies}
        setReplies={setReplies}
        onReply={async (id) => {
          const next = await api<{ tickets: TicketView[] }>("/api/support", { method: "POST", body: JSON.stringify({ action: "reply", id, body: replies[id] || "", as: "user" }) });
          setTickets(next.tickets);
          setReplies((current) => ({ ...current, [id]: "" }));
        }}
      />
    </div>
  );
}
