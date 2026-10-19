"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Copy, Check, Menu, X } from "lucide-react";
import Image from "next/image";
import { ZendoL1ZipLink } from "@/components/zendo-l1-zip";
import { ZendoCoinZipLink } from "@/components/zendocoin-zip";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/sdk";
import { CONTACT_EMAIL } from "@/lib/seed";
import type { PublicUser } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { SearchBox } from "./search-box";

function subscribeToAppMode() {
  return () => {};
}

function getAppModeSnapshot() {
  return document.documentElement.dataset.zendoApp === "android";
}

function getServerAppModeSnapshot() {
  return false;
}

export function Logo({ className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("zendo-inline-flex zendo-items-center", className)} aria-label="Zendo">
      <Image src="/brand/zendo-wordmark.svg" alt="ZENDO" width={148} height={32} className="zendo-h-8 zendo-w-auto" priority unoptimized />
    </Link>
  );
}

export function BrandMark({ kind, className }: { kind: "coin" | "chain"; className?: string }) {
  const coin = kind === "coin";
  return (
    <Image
      src={coin ? "/brand/zendocoin.svg" : "/brand/zendo-chain.svg"}
      alt={coin ? "ZendoCoin" : "Zendo Blockchain"}
      width={coin ? 292 : 48}
      height={coin ? 48 : 48}
      className={cn(coin ? "zendo-h-9 zendo-w-auto" : "zendo-h-11 zendo-w-11", className)}
      unoptimized
    />
  );
}

export function PaperFrame({ tall = false, file = "whitepaper" }: { tall?: boolean; file?: string }) {
  const slug = /^whitepaper(-[a-z]{2})?$/.test(file) ? file : "whitepaper";
  return (
    <div className="zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-panel zendo-p-4">
      <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-justify-between zendo-gap-3">
        <p className="zendo-text-sm zendo-font-medium zendo-text-cream">White paper</p>
        <a href={`/${slug}.pdf`} download={`${slug}.pdf`} className="zendo-text-sm zendo-text-lime">Download PDF</a>
      </div>
      <iframe title="Zendo white paper" src={`/${slug}.html`} className={cn("zendo-mt-3 zendo-w-full zendo-rounded-xl zendo-border zendo-border-line zendo-bg-white", tall ? "zendo-h-[70vh]" : "zendo-h-80")} />
    </div>
  );
}

function MenuLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <DropdownMenu.Item asChild>
      <Link href={href} className="zendo-block zendo-pointer zendo-rounded-xl zendo-px-3 zendo-py-2 zendo-outline-none data-[highlighted]:zendo-bg-white/5">
        <span className="zendo-block zendo-text-sm zendo-text-cream">{title}</span>
        <span className="zendo-block zendo-text-xs zendo-text-muted">{detail}</span>
      </Link>
    </DropdownMenu.Item>
  );
}

function Drop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="zendo-inline-flex zendo-items-center zendo-gap-1 zendo-rounded-full zendo-px-3 zendo-py-2 zendo-text-sm zendo-text-cream hover:zendo-bg-white/5 data-[state=open]:zendo-bg-white/5">
        {label}
        <ChevronDown className="zendo-h-4 zendo-w-4 zendo-opacity-70" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={8} className="zendo-z-50 zendo-min-w-64 zendo-rounded-2xl zendo-border zendo-border-line zendo-bg-panel zendo-p-1.5 zendo-shadow-2xl">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const appMode = useSyncExternalStore(subscribeToAppMode, getAppModeSnapshot, getServerAppModeSnapshot);
  const [menuPath, setMenuPath] = useState(pathname);
  const [user, setUser] = useState<PublicUser | null>(null);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) localStorage.setItem("zendo_ref", ref);
  }, [pathname]);

  useEffect(() => {
    let stop = false;
    api<{ user: PublicUser | null }>("/api/auth/me")
      .then((data) => {
        if (!stop) setUser(data.user);
      })
      .catch(() => {
        if (!stop) setUser(null);
      });
    return () => {
      stop = true;
    };
  }, [pathname]);

  async function signOut() {
    await api("/api/auth/signout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="zendo-site-header zendo-sticky zendo-top-0 zendo-z-40 zendo-border-b zendo-border-line/80 zendo-bg-ink/85 zendo-backdrop-blur-md">
      <a href="#content" className="zendo-sr-only focus:zendo-not-sr-only focus:zendo-absolute focus:zendo-left-4 focus:zendo-top-3 focus:zendo-z-50 focus:zendo-rounded-lg focus:zendo-bg-lime focus:zendo-px-3 focus:zendo-py-2 focus:zendo-text-ink">
        Skip to content
      </a>
      <div className="zendo-site-container zendo-site-header-inner zendo-flex zendo-h-[4.5rem] zendo-items-center">
        <Logo className="zendo-header-logo" />
        <nav className="zendo-desktop-nav" aria-label="Primary navigation">
          <Link href="/launchpad" className="zendo-rounded-full zendo-px-3 zendo-py-2 zendo-text-sm hover:zendo-bg-white/5">Launchpad</Link>
          <Link href="/explorer" className="zendo-rounded-full zendo-px-3 zendo-py-2 zendo-text-sm hover:zendo-bg-white/5">Explorer</Link>
          <Link href="/search" className="zendo-rounded-full zendo-px-3 zendo-py-2 zendo-text-sm hover:zendo-bg-white/5">Search</Link>
          <Link href="/zcoin" className="zendo-rounded-full zendo-px-3 zendo-py-2 zendo-text-sm hover:zendo-bg-white/5">ZCoin</Link>
          <Link href="/bridge" className="zendo-rounded-full zendo-px-3 zendo-py-2 zendo-text-sm hover:zendo-bg-white/5">Bridge</Link>
          <Drop label="Company">
            <MenuLink href="/about" title="About us" detail="Chain, coin, and launchpad in one node" />
            <MenuLink href="/faq" title="FAQ" detail="Wallets, fees, vesting, and resets" />
            <MenuLink href="/whitepaper" title="White paper" detail="Supply, vesting, curve, and fees" />
            <MenuLink href="/contact" title="Contact us" detail={CONTACT_EMAIL} />
            <MenuLink href="/developers" title="Developers" detail="SDK, CLI, JSON-RPC, and config" />
            <MenuLink href="/onboarding" title="Onboarding" detail="Wallet, phrase, stake, vote, and launch" />
            <MenuLink href="/learn" title="Learn" detail="Guides and a live curve quote" />
            <MenuLink href="/grants" title="Grants" detail="Treasury votes and payouts" />
            <MenuLink href="/market" title="Marketplace" detail="Module notes and referral totals" />
          </Drop>
          <Drop label="Legal">
            <MenuLink href="/privacy" title="Privacy policy" detail="What this chain stores" />
            <MenuLink href="/terms" title="Terms and conditions" detail="How the software may be used" />
          </Drop>
        </nav>
        <div className="zendo-header-actions">
          <div className="zendo-header-search">
            <SearchBox compact />
          </div>
          {user ? (
            <>
              <Link href="/app" className="zendo-header-user zendo-text-sm zendo-text-muted hover:zendo-text-cream">{user.displayName}</Link>
              <Button size="sm" className="zendo-header-auth-action" onClick={() => router.push("/app")}>Wallet</Button>
              <Button size="sm" className="zendo-header-auth-action" variant="ghost" onClick={signOut}>Sign out</Button>
            </>
          ) : (
            <>
              <Button size="sm" className="zendo-header-auth-action" variant="ghost" onClick={() => router.push("/signin")}>Log In</Button>
              <Button size="sm" className="zendo-header-auth-action" onClick={() => router.push("/signup")}>Sign Up</Button>
            </>
          )}
        </div>
        <button className="zendo-header-menu zendo-pointer zendo-ml-auto zendo-rounded-lg zendo-p-2" aria-expanded={open} aria-label="Open menu" onClick={() => setOpen((value) => !value)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open ? (
        <div className="zendo-mobile-drawer zendo-border-t zendo-border-line zendo-px-4 zendo-py-3">
          <div className="zendo-grid zendo-gap-1">
            {!appMode ? <div className="zendo-px-1 zendo-pb-2"><SearchBox compact /></div> : null}
            <Link href="/" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Home</Link>
            <Link href="/launchpad" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Launchpad</Link>
            <Link href="/app/send" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Send / Receive</Link>
            <Link href="/app/stake" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Staking</Link>
            <Link href="/governance" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Governance</Link>
            <Link href="/market" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Marketplace</Link>
            <Link href="/bridge" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Polygon Bridge</Link>
            <Link href="/zcoin" className="zendo-rounded-xl zendo-px-3 zendo-py-2">ZendoCoin</Link>
            {!appMode ? <><details className="zendo-rounded-xl zendo-px-3 zendo-py-2"><summary className="zendo-pointer">Company</summary><div className="zendo-mt-2 zendo-grid zendo-gap-1 zendo-pl-2 zendo-text-sm zendo-text-muted"><Link href="/about">About us</Link><Link href="/faq">FAQ</Link><Link href="/whitepaper">White paper</Link><Link href="/contact">Contact us</Link><Link href="/developers">Developers</Link><Link href="/onboarding">Onboarding</Link><Link href="/learn">Learn</Link><Link href="/grants">Grants</Link><Link href="/market">Marketplace</Link></div></details><details className="zendo-rounded-xl zendo-px-3 zendo-py-2"><summary className="zendo-pointer">Legal</summary><div className="zendo-mt-2 zendo-grid zendo-gap-1 zendo-pl-2 zendo-text-sm zendo-text-muted"><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms and conditions</Link></div></details></> : null}
            {user ? (
              <>
                <Link href="/app" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Wallet</Link>
                <Link href="/app/social" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Social</Link>
                <Link href="/app/support" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Support tickets</Link>
                <Link href="/app/settings" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Settings</Link>
                <button className="zendo-pointer zendo-rounded-xl zendo-px-3 zendo-py-2 zendo-text-left" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <>
                <Link href="/signin" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Log In</Link>
                <Link href="/forgot-password" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Forgot Password</Link>
                <Link href="/recover" className="zendo-rounded-xl zendo-px-3 zendo-py-2">Recover Account</Link>
                <Link href="/signup" className="zendo-rounded-xl zendo-bg-lime zendo-px-3 zendo-py-2 zendo-text-center zendo-font-semibold zendo-text-ink">Sign Up</Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="zendo-site-footer zendo-mt-16 zendo-border-t zendo-border-line">
      <div className="zendo-mx-auto zendo-grid zendo-max-w-6xl zendo-gap-8 zendo-px-4 zendo-py-10 zendo-sm:zendo-grid-cols-2 zendo-lg:zendo-grid-cols-4">
        <div>
          <Logo />
          <p className="zendo-mt-3 zendo-text-sm zendo-leading-6 zendo-text-muted">A chain you host yourself. Keys stay in the wallet that created them. The ledger stays on disk.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="zendo-mt-3 zendo-inline-block zendo-text-sm zendo-text-lime">{CONTACT_EMAIL}</a>
          <a href="/whitepaper.pdf" download="zendo-whitepaper.pdf" className="zendo-mt-2 zendo-block zendo-text-sm zendo-text-lime">Download the white paper</a>
          <a href="/Zendo.apk" className="zendo-mt-2 zendo-block zendo-text-sm zendo-text-lime">Download the APK</a>
          <ZendoL1ZipLink className="zendo-mt-2 zendo-block zendo-text-sm zendo-text-lime">Download ZendoDeployL1.zip</ZendoL1ZipLink>
          <ZendoCoinZipLink className="zendo-mt-2 zendo-block zendo-text-sm zendo-text-lime">Polygon contracts</ZendoCoinZipLink>
        </div>
        <FooterCol title="Product" links={[["/launchpad", "Launchpad"], ["/explorer", "Explorer"], ["/assets", "External assets"], ["/search", "Search"], ["/app/social", "Social"], ["/zcoin", "ZendoCoin"], ["/bridge", "Polygon bridge"], ["/governance", "Governance"], ["/grants", "Grants"], ["/market", "Marketplace"], ["/onboarding", "Onboarding"], ["/learn", "Learn"], ["/developers", "Developers"], ["/whitepaper.pdf", "White paper PDF"]]} />
        <FooterCol title="Company" links={[["/about", "About us"], ["/faq", "FAQ"], ["/whitepaper", "White paper"], ["/contact", "Contact us"], ["/cross-platform", "Cross-platform"], ["/app/support", "Support tickets"]]} />
        <FooterCol title="Legal" links={[["/privacy", "Privacy policy"], ["/terms", "Terms and conditions"]]} />
      </div>
      <p className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-pb-8 zendo-text-xs zendo-leading-5 zendo-text-muted">
        Zendo L-1 Network keeps ZendoCoin and launchpad balances in the ledger on the machine that runs this node. It does not custody dollars, move fiat, or pay out off-chain. Users hold their own recovery phrase. Whether a deployment needs a license depends on what the operator does and where they operate. Nothing on this site is legal, financial, or investment advice.
      </p>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="zendo-text-sm zendo-font-semibold">{title}</p>
      <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm zendo-text-muted">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="hover:zendo-text-cream">{label}</Link>
        ))}
      </div>
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cn("zendo-pointer zendo-inline-flex zendo-items-center zendo-gap-1 zendo-rounded-lg zendo-border zendo-border-line zendo-px-2 zendo-py-1 zendo-text-xs zendo-text-muted hover:zendo-text-cream")}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check className="zendo-h-3.5 zendo-w-3.5" /> : <Copy className="zendo-h-3.5 zendo-w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function TimeAgo({ at }: { at: number }) {
  const stamp = Number.isFinite(at) ? at : null;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const start = setTimeout(tick, 0);
    const id = setInterval(tick, 15000);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, []);
  const label = stamp === null || now === null ? "just now" : relative(stamp, now);
  return <time dateTime={stamp === null ? undefined : new Date(stamp).toISOString()}>{label}</time>;
}

function relative(at: number, now: number) {
  if (!Number.isFinite(at)) return "just now";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function PriceChart({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) {
    return <div className="zendo-grid zendo-h-48 zendo-place-items-center zendo-text-sm zendo-text-muted">The chart starts with the first trade.</div>;
  }
  const w = 640;
  const h = 220;
  const pad = 10;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || Math.max(max, 1e-12);
  const coords = points.map((point, index) => {
    const x = pad + (index / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (point - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map((coord, index) => `${index === 0 ? "M" : "L"}${coord[0].toFixed(1)},${coord[1].toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${h - pad} L${coords[0][0].toFixed(1)},${h - pad} Z`;
  const color = up ? "#C8FF00" : "#ff6b5a";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="zendo-h-52 zendo-w-full" role="img" aria-label="Price chart">
      <path d={area} fill={color} opacity="0.14" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="zendo-mb-4 zendo-inline-block zendo-text-sm zendo-text-lime">{label}</Link>;
}

export function PageIntro({ kicker, title, body, mark }: { kicker?: string; title: string; body?: string; mark?: "coin" | "chain" }) {
  return (
    <div className="zendo-mb-8 zendo-max-w-3xl">
      {mark ? <div className="zendo-mb-4"><BrandMark kind={mark} /></div> : null}
      {kicker ? <p className="zendo-mb-2 zendo-text-xs zendo-font-semibold zendo-uppercase zendo-tracking-[0.16em] zendo-text-lime">{kicker}</p> : null}
      <h1 className="zendo-font-display zendo-text-4xl zendo-font-bold zendo-tracking-tight zendo-sm:zendo-text-5xl">{title}</h1>
      {body ? <p className="zendo-mt-3 zendo-text-base zendo-leading-7 zendo-text-muted">{body}</p> : null}
    </div>
  );
}
