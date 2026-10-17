import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const papers = JSON.parse(readFileSync(new URL("../docs/papers.json", import.meta.url), "utf8"));
const chrome = process.env.CHROME || "/usr/bin/google-chrome";

for (const paper of papers) {
  const source = readFileSync(new URL(`../${paper.source}`, import.meta.url), "utf8");
  if (!source.includes("__VERSION__")) {
    console.error(`${paper.source} must keep the __VERSION__ marker`);
    process.exit(1);
  }
  const stamp = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const body = source.replaceAll("__VERSION__", version);
  const html = `<!doctype html>
<html lang="${paper.htmlLang}" dir="${paper.dir}">
<head>
  <meta charset="utf-8" />
  <title>Zendo white paper ${version} ${stamp}</title>
  <style>
    body { font-family: Georgia, "Noto Sans SC", "Noto Sans Devanagari", "Noto Naskh Arabic", serif; color: #1a1a1a; max-width: 680px; margin: 32px auto; line-height: 1.55; }
    h1 { font-family: Arial, "Noto Sans SC", "Noto Sans Devanagari", "Noto Naskh Arabic", sans-serif; font-size: 28px; letter-spacing: 0.04em; color: #1d4ed8; }
    h2 { font-family: Arial, "Noto Sans SC", "Noto Sans Devanagari", "Noto Naskh Arabic", sans-serif; font-size: 16px; margin-top: 1.4em; color: #111; }
    p { font-size: 12.5px; }
    code { font-family: ui-monospace, monospace; font-size: 11px; }
    .meta { color: #555; font-family: Arial, sans-serif; font-size: 11px; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
  const input = join(tmpdir(), `zendo-${paper.slug}.html`);
  const htmlPath = new URL(`../public/${paper.slug}.html`, import.meta.url);
  const output = new URL(`../public/${paper.slug}.pdf`, import.meta.url);
  writeFileSync(input, html);
  writeFileSync(htmlPath, html);
  const printed = spawnSync(chrome, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-pdf-header-footer",
    "--timeout=20000",
    "--virtual-time-budget=4000",
    `--user-data-dir=${join(tmpdir(), `zendo-chrome-${paper.slug}`)}`,
    `--print-to-pdf=${output.pathname}`,
    input,
  ], { stdio: "inherit", timeout: 45000 });
  if (printed.status !== 0) process.exit(printed.status || 1);
  console.log(`wrote ${paper.slug} for ${version} ${stamp}`);
}
