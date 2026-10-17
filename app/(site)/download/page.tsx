import type { Metadata } from "next";
import { PageIntro } from "@/components/chrome";
import { ZendoL1ZipLink } from "@/components/zendo-l1-zip";
import { ZendoCoinZipLink } from "@/components/zendocoin-zip";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Download" };

export default function Page() {
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-12">
      <PageIntro
        kicker="Package"
        title="Download Zendo"
        body="ZendoDeployL1.zip is the source package for this node. ZendoL-1_App.zip is the same tree under the archive name used by earlier hosts. On a phone, tap the gold button and stay in Chrome until the download finishes. Open the zip, read README.md, then run npm install and npm run dev. The Polygon zip is only the optional external token contracts."
      />
      <div className="zendo-flex zendo-flex-wrap zendo-gap-3">
        <ZendoL1ZipLink className="zendo-pointer zendo-inline-flex zendo-h-12 zendo-items-center zendo-justify-center zendo-rounded-full zendo-bg-gold zendo-px-5 zendo-text-base zendo-font-semibold zendo-text-ink">Download ZendoDeployL1.zip</ZendoL1ZipLink>
        <Button size="lg" variant="outline" asChild>
          <a href="/whitepaper.pdf">White paper</a>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <a href="/Zendo.apk">Android APK</a>
        </Button>
        <ZendoCoinZipLink className="zendo-pointer zendo-inline-flex zendo-h-12 zendo-items-center zendo-justify-center zendo-rounded-full zendo-border zendo-border-line zendo-px-5 zendo-text-base zendo-font-semibold zendo-text-cream">Polygon contracts</ZendoCoinZipLink>
      </div>
      <p className="zendo-mt-4 zendo-break-all zendo-text-sm zendo-leading-6 zendo-text-muted">
        If the button does nothing, open this address in Chrome:{" "}
        <a className="zendo-text-lime" href="https://expressed-displayed-opera-hugh.trycloudflare.com/ZendoDeployL1.zip" target="_top" rel="noopener">
          https://expressed-displayed-opera-hugh.trycloudflare.com/ZendoDeployL1.zip
        </a>
        . Chrome saves ZendoDeployL1.zip in Downloads. The same tree is also at ZendoL-1_App.zip. Open Files, tap the zip, and choose Extract. README.md is inside.
      </p>
    </div>
  );
}
