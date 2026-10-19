"use client";

import { CircleUserRound, Compass, CreditCard, Home } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/app", signInHref: "/signin?next=%2Fapp", label: "Wallet", icon: CreditCard },
  { href: "/explorer", label: "Explore", icon: Compass },
  { href: "/app/settings", signInHref: "/signin?next=%2Fapp%2Fsettings", label: "Profile", icon: CircleUserRound },
];

export function MobileAppNav({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const signInDestination = pathname === "/signin" ? searchParams.get("next") : null;
  return (
    <nav className="zendo-mobile-app-nav" aria-label="App navigation">
      {items.map(({ href, signInHref, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`) || signInDestination === href;
        return (
          <Link key={href} href={authenticated ? href : signInHref || href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
