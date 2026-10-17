const raw = (process.env.ZENDO_NODE_URL || "").trim();

if (!raw) {
  console.error("ZENDO_NODE_URL is required for the hosted investor APK.");
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error("ZENDO_NODE_URL must be a valid HTTPS URL.");
  process.exit(1);
}

const host = url.hostname.toLowerCase();
const blocked = new Set(["localhost", "127.0.0.1", "::1", "10.0.2.2", "appassets.androidplatform.net"]);
if (url.protocol !== "https:" || url.username || url.password || blocked.has(host) || host.endsWith(".local")) {
  console.error("ZENDO_NODE_URL must be an approved public HTTPS origin, not a local, emulator, or asset-loader host.");
  process.exit(1);
}

if (url.pathname !== "/" || url.search || url.hash) {
  console.error("ZENDO_NODE_URL must be an origin without a path, query, or fragment.");
  process.exit(1);
}

console.log(`Hosted Android origin verified: ${url.origin}`);
