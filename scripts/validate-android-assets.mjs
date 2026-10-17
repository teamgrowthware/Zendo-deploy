import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(process.cwd(), "android", "app", "src", "demo", "assets", "www"));
const textExtensions = new Set([".html", ".htm", ".js", ".mjs", ".css", ".json", ".webmanifest", ".map"]);
const htmlExtensions = new Set([".html", ".htm"]);

function cleanUrl(value) {
  return value.replaceAll("\\\\/", "/").replace(/[?#].*$/, "").replace(/[\\\\]+$/, "").trim();
}

function isLocalReference(value) {
  return value.startsWith("/_next/") || value.startsWith("/assets/") || value.startsWith("/brand/") ||
    value.startsWith("/logo.") || value.startsWith("/favicon.") || value.startsWith("/manifest.");
}

function toAssetPath(fromFile, raw) {
  const value = cleanUrl(raw);
  if (!value || !isLocalReference(value)) return null;
  const relative = value.startsWith("/") ? value.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), value));
  if (relative === ".." || relative.startsWith("../")) return null;
  // Android's asset packager omits an `_next` directory. The Android bridge
  // serves the original WebView URL from the package-safe `next` directory.
  return relative.startsWith("_next/") ? `next/${relative.slice("_next/".length)}` : relative;
}

async function walk(dir, relative = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path.join(dir, entry.name), next));
    else files.push(next);
  }
  return files;
}

function references(text) {
  const found = new Set();
  // Handles HTML attributes, CSS url(), JSON manifests, and URL strings in
  // Next/Turbopack runtime chunks. Query strings are intentionally ignored for
  // asset lookup because Android assets are path-addressed.
  const matcher = /(?:https?:\/\/appassets\.androidplatform\.net)?(\/(?:_next|assets|brand)\/[^"'`\s)<>,]+|\/(?:logo|favicon|manifest)\.[A-Za-z0-9._-]+)/g;
  let match;
  while ((match = matcher.exec(text))) {
    const value = match[1].replaceAll("\\/", "/");
    // This is a request handler, not a file. MainActivity resolves the local
    // `url` query parameter before opening an Android asset.
    if (value.startsWith("/_next/image")) continue;
    // Runtime string fragments such as `/brand/name.` and template literals
    // are not concrete filenames and cannot be asserted statically.
    const concrete = cleanUrl(value);
    if (/[${(]/.test(value) || /\/$/.test(value) || /\.$/.test(concrete) || concrete === "/_next/static/immutable") continue;
    found.add(value);
  }
  return found;
}

const files = await walk(root);
const available = new Set(files);
const missing = new Map();
const htmlJs = new Set();
const htmlCss = new Set();
let scanned = 0;

for (const file of files) {
  const extension = path.posix.extname(file).toLowerCase();
  if (!textExtensions.has(extension)) continue;
  scanned += 1;
  const content = await fs.readFile(path.join(root, ...file.split("/")), "utf8");
  for (const raw of references(content)) {
    const target = toAssetPath(file, raw);
    if (!target) continue;
    if (htmlExtensions.has(extension)) {
      if (/\.js(?:$|[?#])/i.test(raw)) htmlJs.add(target);
      if (/\.css(?:$|[?#])/i.test(raw)) htmlCss.add(target);
    }
    if (!available.has(target)) {
      const sources = missing.get(target) || new Set();
      sources.add(file);
      missing.set(target, sources);
    }
  }
  if (htmlExtensions.has(extension)) {
    const attributes = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
    let match;
    while ((match = attributes.exec(content))) {
      const raw = match[1];
      const target = toAssetPath(file, raw);
      if (!target) continue;
      if (/\.js(?:$|[?#])/i.test(raw)) htmlJs.add(target);
      if (/\.css(?:$|[?#])/i.test(raw)) htmlCss.add(target);
      if (raw.startsWith("/_next/image")) continue;
      if (!available.has(target)) {
        const sources = missing.get(target) || new Set();
        sources.add(file);
        missing.set(target, sources);
      }
    }
  }
}

const missingJs = [...missing.keys()].filter((file) => /\.m?js$/i.test(file));
const missingCss = [...missing.keys()].filter((file) => /\.css$/i.test(file));
console.log(JSON.stringify({
  root,
  scannedTextFiles: scanned,
  htmlReferencedJs: htmlJs.size,
  htmlReferencedCss: htmlCss.size,
  missingJs: missingJs.length,
  missingCss: missingCss.length,
  missingAssets: missing.size,
}, null, 2));

if (missing.size) {
  for (const [asset, sources] of missing) console.error(`Missing Android asset: /${asset} (referenced by ${[...sources].join(", ")})`);
  process.exit(1);
}
