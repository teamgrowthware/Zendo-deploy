import Link from "next/link";
import { Logo } from "@/components/chrome";

export default function NotFound() {
  return (
    <div className="zendo-mx-auto zendo-max-w-lg zendo-px-4 zendo-py-20">
      <Logo />
      <h1 className="zendo-mt-6 zendo-font-display zendo-text-4xl zendo-font-bold">Page not found</h1>
      <p className="zendo-mt-3 zendo-text-muted">This address is not on the node. The block, wallet, or coin may be outside the recent window, or the link is wrong.</p>
      <div className="zendo-mt-6 zendo-flex zendo-flex-wrap zendo-gap-4">
        <Link href="/" className="zendo-text-lime">Home</Link>
        <Link href="/explorer" className="zendo-text-lime">Explorer</Link>
      </div>
    </div>
  );
}
