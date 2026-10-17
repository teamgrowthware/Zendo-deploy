import type { Metadata } from "next";
import { BackLink } from "@/components/chrome";
import { SocialDesk } from "@/components/social";

export const metadata: Metadata = { title: "Social" };

export default function Page() {
  return (
    <div>
      <BackLink href="/app" label="Back to the wallet" />
      <h1 className="zendo-mb-2 zendo-font-display zendo-text-4xl zendo-font-bold">Social</h1>
      <p className="zendo-mb-4 zendo-max-w-2xl zendo-text-sm zendo-leading-6 zendo-text-muted">
        Profiles, follows, posts, stories, video notes, circles, and direct messages stay on this node. Nothing here mints coins or sends mail.
      </p>
      <SocialDesk />
    </div>
  );
}
