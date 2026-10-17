import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const papers = JSON.parse(readFileSync(new URL("../docs/papers.json", import.meta.url), "utf8"));

for (const paper of papers) {
  const body = readFileSync(new URL(`../${paper.source}`, import.meta.url), "utf8");
  if (!body.includes("__VERSION__")) {
    console.error(`${paper.source} must keep the __VERSION__ marker`);
    process.exit(1);
  }
  const stamp = createHash("sha256").update(body).digest("hex").slice(0, 12);
  const pdf = readFileSync(new URL(`../public/${paper.slug}.pdf`, import.meta.url)).toString("latin1");
  const html = readFileSync(new URL(`../public/${paper.slug}.html`, import.meta.url), "utf8");
  const title = `Zendo white paper ${version} ${stamp}`;
  if (!pdf.includes(title) || !html.includes(title)) {
    console.error(`${paper.slug} is not stamped ${title}. Run: node scripts/print-whitepaper.mjs`);
    process.exit(1);
  }
  console.log(`${paper.code} matches ${version} ${stamp}`);
}
