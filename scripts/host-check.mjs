import { existsSync, statSync } from "node:fs";
import path from "node:path";

let failed = 0;

function line(ok, name, detail) {
  console.log(`${ok ? "ok" : "fix"}  ${name}: ${detail}`);
  if (!ok) failed += 1;
}

const origin = (process.env.ZENDO_PUBLIC_ORIGIN || "").trim();
if (!origin) line(true, "origin", "unset. Set ZENDO_PUBLIC_ORIGIN to the Cloudflare https host.");
else line(origin.startsWith("https://"), "origin", origin);

const l1 = (process.env.ZENDO_L1_RPC || "").trim();
if (!l1) line(true, "l1-rpc", "unset. Point ZENDO_L1_RPC at the zendo-node RPC, for example http://127.0.0.1:47111.");
else {
  let parsed;
  try {
    parsed = new URL(l1);
  } catch {
    parsed = null;
  }
  line(Boolean(parsed && (parsed.protocol === "https:" || parsed.protocol === "http:")), "l1-rpc", l1);
}

const rpc = (process.env.QUICKNODE_POLYGON_RPC_URL || process.env.POLYGON_RPC_URL || "").trim();
if (!rpc) line(true, "polygon", "unset. Optional external bridge only. Launchpad trades settle on zendo-1.");
else {
  let parsed;
  try {
    parsed = new URL(rpc);
  } catch {
    parsed = null;
  }
  line(Boolean(parsed && parsed.protocol === "https:" && !parsed.username), "polygon", rpc.replace(/\/\/.*@/, "//"));
}

const chain = (process.env.ZENDO_POLYGON_CHAIN_ID || "137").trim();
line(chain === "137", "external-chain", `${chain} (optional Polygon token, not zendo-1)`);

function keyMode(name) {
  const keyFile = path.join(process.env.ZENDO_DATA_DIR || "data", name);
  if (!existsSync(keyFile)) line(true, name, `no ${name} file. A file, when present, must be mode 0600.`);
  else {
    const mode = statSync(keyFile).mode & 0o777;
    line(mode === 0o600, name, mode.toString(8));
  }
}

keyMode("bridge.key");
keyMode("operator.key");

const database = (process.env.ZENDO_DATABASE_URL || "").trim();
line(true, "database", database ? "primary url is set" : "unset, this process uses SQLite");
const replica = (process.env.ZENDO_DATABASE_REPLICA_URL || "").trim();
line(true, "replica", replica ? "read url is set" : "unset, reads use the primary");
const redis = (process.env.ZENDO_REDIS_URL || "").trim();
line(true, "redis", redis ? "cache url is set" : "unset, this process keeps the cache in memory");
const jwt = (process.env.ZENDO_JWT_SECRET || "").trim();
line(!jwt || jwt.length >= 32, "jwt", jwt ? "shared secret is set" : "unset, this process keeps a local secret file");

process.exit(failed ? 1 : 0);
