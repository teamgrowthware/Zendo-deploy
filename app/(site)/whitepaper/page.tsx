import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { PageIntro, PaperFrame } from "@/components/chrome";
import { cn } from "@/lib/cn";

const faces: Record<string, string> = {
  zh: "[font-family:'Noto_Sans_SC','PingFang_SC','Microsoft_YaHei',sans-serif]",
  hi: "[font-family:'Noto_Sans_Devanagari','Nirmala_UI',sans-serif]",
  ar: "[font-family:'Noto_Naskh_Arabic','Geeza_Pro',sans-serif]",
};

type Paper = { code: string; label: string; source: string; slug: string; htmlLang: string; dir: "ltr" | "rtl" };

function paperPath(code: string) {
  if (code === "es") return join(process.cwd(), "docs/whitepaper-es.html");
  if (code === "zh") return join(process.cwd(), "docs/whitepaper-zh.html");
  if (code === "hi") return join(process.cwd(), "docs/whitepaper-hi.html");
  if (code === "ar") return join(process.cwd(), "docs/whitepaper-ar.html");
  return join(process.cwd(), "docs/whitepaper-body.html");
}

export const metadata: Metadata = { title: "White paper" };

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const version = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version as string;
  const papers = JSON.parse(readFileSync(join(process.cwd(), "docs/papers.json"), "utf8")) as Paper[];
  const paper = papers.find((item) => item.code === lang) ?? papers[0];
  const body = readFileSync(paperPath(paper.code), "utf8").replaceAll("__VERSION__", version);
  const face = faces[paper.code] || "";
  return (
    <article className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-12">
      <PageIntro kicker="Docs" title="White paper" body={`Version ${version}. English, Spanish, Chinese, Hindi, and Arabic are the same note. Reprint every file when the source changes.`} />
      <nav className="zendo-mb-6 zendo-flex zendo-flex-wrap zendo-gap-2" aria-label="White paper language">
        {papers.map((item) => (
          <Link
            key={item.code}
            href={item.code === "en" ? "/whitepaper" : `/whitepaper?lang=${item.code}`}
            className={cn("zendo-rounded-full zendo-border zendo-px-3 zendo-py-1 zendo-text-sm", item.code === paper.code ? "zendo-border-lime zendo-bg-lime zendo-text-ink" : "zendo-border-line zendo-text-muted")}
            hrefLang={item.htmlLang}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <p className="zendo-mb-6">
        <a href={`/${paper.slug}.pdf`} download={`${paper.slug}.pdf`} className="zendo-text-sm zendo-text-lime">Download the PDF</a>
      </p>
      <div className={cn("whitepaper", face)} dir={paper.dir} lang={paper.htmlLang} dangerouslySetInnerHTML={{ __html: body }} />
      <div className="zendo-mt-8">
        <PaperFrame tall file={paper.slug} />
      </div>
    </article>
  );
}
