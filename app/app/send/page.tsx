import type { Metadata } from "next";
import { BackLink } from "@/components/chrome";
import { SendForm } from "@/components/app-views";

export const metadata: Metadata = { title: "Send" };

export default function Page() {
  return (
    <div>
      <BackLink href="/app" label="Back to the wallet" />
      <h1 className="zendo-mb-4 zendo-font-display zendo-text-4xl zendo-font-bold">Send</h1>
      <SendForm />
    </div>
  );
}
