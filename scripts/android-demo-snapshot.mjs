import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const BASE = process.env.ZENDO_SNAPSHOT_URL || "http://127.0.0.1:39200";
const ROOT = process.cwd();
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "android", "app", "src", "demo", "assets", "www"));
const MAX_PAGES = Number(process.env.ZENDO_SNAPSHOT_MAX || 500);
const ORIGIN = new URL(BASE).origin;

const SEEDS = [
  "/", "/about", "/assets", "/bridge", "/contact", "/contracts", "/cross-platform",
  "/developers", "/download", "/explorer", "/explorer/addresses", "/explorer/blocks",
  "/explorer/consensus", "/explorer/contracts", "/explorer/staking", "/explorer/stats",
  "/explorer/txs", "/explorer/validators", "/faq", "/forgot-password", "/reset-password",
  "/recover", "/governance", "/grants", "/launchpad", "/launchpad/create", "/learn",
  "/market", "/onboarding", "/privacy", "/search", "/signin", "/signup", "/terms",
  "/whitepaper", "/zcoin",
  "/app", "/app/admin", "/app/bridge", "/app/send", "/app/settings", "/app/social",
  "/app/stake", "/app/support",
];

const SKIP = [/^\/api\//, /^\/_next\/data\//, /^\/zendo-history\//, /\.zip$/i, /\.apk$/i, /^\/watch$/];

const seen = new Set();
const queued = new Set();
const assets = new Set();
let pages = 0;
let htmlBytes = 0;

function routeToFile(route) {
  const url = new URL(route, BASE);
  let p = decodeURIComponent(url.pathname);
  if (!p.startsWith("/")) p = "/" + p;
  if (p.endsWith("/")) p = p.slice(0, -1);
  if (p === "") return path.join(OUT, "index.html");
  if (/\.[a-z0-9]+$/i.test(p)) return path.join(OUT, p.slice(1));
  return path.join(OUT, p.slice(1), "index.html");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function exists(p) {
  return fs.access(p).then(() => true, () => false);
}

async function save(route, body) {
  const file = routeToFile(route);
  await ensureDir(path.dirname(file));
  // A static snapshot has no Next.js server to answer RSC navigation requests.
  // Keep the server-rendered UI, but use ordinary document navigation for links
  // that are present in the bundled asset tree.
  const navigationShim = `<script>(function(){document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target||a.hasAttribute('download'))return;var u;try{u=new URL(a.href,location.href)}catch(_){return}if(u.origin!==location.origin||u.protocol!==location.protocol||u.pathname.indexOf('/api/')===0)return;e.preventDefault();location.assign(u.pathname+u.search+u.hash)},true)})()</script>`;
  const snapshot = body.includes('</head>') ? body.replace('</head>', `${navigationShim}</head>`) : body;
  await fs.writeFile(file, snapshot);
  pages += 1;
  htmlBytes += snapshot.length;
}

function extractLinks(html) {
  const out = new Set();
  const re = /(?:href|src)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1];
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("data:")) continue;
    let u;
    try { u = new URL(raw, BASE); } catch { continue; }
    if (u.origin !== ORIGIN) continue;
    if (u.search && !/^\?[a-zA-Z0-9_=&%-]*_rsc=/.test(u.search)) {
      // keep query strings only for known static endpoints; otherwise drop
    }
    out.add(u.pathname);
  }
  return out;
}

async function get(route) {
  return fetch(new URL(route, BASE), {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": "zendo-android-demo-snapshot" },
    redirect: "follow",
  });
}

async function crawl() {
  const queue = [...SEEDS];
  while (queue.length && pages < MAX_PAGES) {
    const route = queue.shift();
    if (seen.has(route)) continue;
    seen.add(route);
    const p = new URL(route, BASE).pathname;
    if (SKIP.some((re) => re.test(p))) continue;
    let res;
    try {
      res = await fetch(new URL(route, BASE), {
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": "zendo-android-demo-snapshot" },
        redirect: "follow",
      });
    } catch (err) {
      console.warn("skip", route, String(err));
      continue;
    }
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) continue;
    if (res.status >= 400) { console.warn("status", res.status, route); continue; }
    const html = await res.text();
    await save(route, html);
    console.log("page", route, html.length);
    if (pages >= MAX_PAGES) break;
    for (const link of extractLinks(html)) {
      const lp = new URL(link, BASE).pathname;
      if (SKIP.some((re) => re.test(lp))) continue;
      if (lp.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(lp)) { assets.add(lp); continue; }
      if (seen.has(lp) || queued.has(lp)) continue;
      queued.add(lp);
      queue.push(lp);
    }
  }
}

async function copyTree(src, dst, skipExisting = false) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) { await copyTree(s, d, skipExisting); continue; }
    if (skipExisting && (await exists(d))) continue;
    await fs.copyFile(s, d);
  }
}

async function fetchExtraAssets() {
  for (const a of assets) {
    if (a.startsWith("/_next/static/")) continue;
    const file = path.join(OUT, a.replace(/^\//, ""));
    if (await exists(file)) continue;
    try {
      const res = await fetch(new URL(a, BASE));
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      await ensureDir(path.dirname(file));
      await fs.writeFile(file, buf);
    } catch { /* ignore */ }
  }
}

async function dirSize(dir) {
  let sum = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) sum += await dirSize(p);
    else sum += (await fs.stat(p)).size;
  }
  return sum;
}

async function countFiles(dir) {
  let n = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) n += await countFiles(p);
    else n += 1;
  }
  return n;
}

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });
  console.log("snapshot", BASE, "->", OUT);
  await copyTree(path.join(ROOT, ".next", "static"), path.join(OUT, "_next", "static"));
  await crawl();
  await fetchExtraAssets();
  await copyTree(path.join(ROOT, "public"), OUT, true);
  // AAPT excludes the `_next` directory from APK assets. Keep the browser URL
  // unchanged and store the same tree under the Android-safe `next` name;
  // MainActivity maps /_next requests back to this package path.
  await fs.rename(path.join(OUT, "_next"), path.join(OUT, "next"));
  // The server and .next/static must belong to the same completed build.  The
  // caller starts `next start` only after `next build`; validate the resulting
  // Android asset tree here so this command cannot silently produce a broken
  // snapshot.
  const validation = spawnSync(process.execPath, [path.join(ROOT, "scripts", "validate-android-assets.mjs"), OUT], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (validation.status !== 0) {
    throw new Error(`Android asset validation failed with exit code ${validation.status ?? "unknown"}`);
  }
  const total = await dirSize(OUT);
  const files = await countFiles(OUT);
  console.log(JSON.stringify({ out: OUT, pages, htmlBytes, files, totalBytes: total }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
