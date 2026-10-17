import type { Metadata } from "next";
import { PageIntro } from "@/components/chrome";
import { CONTACT_EMAIL } from "@/lib/seed";

export const metadata: Metadata = { title: "Contact us" };

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-12">
      <PageIntro kicker="Company" title="Contact us" body={CONTACT_EMAIL} />
      <p className="zendo-text-sm">
        <a className="zendo-text-lime" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </div>
  );
}
