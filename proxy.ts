import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicOrigins } from "@/lib/cors";

const HISTORY = /^\/zendo-history\/([a-f0-9]{32})\/(zendo-history\.(?:json|csv))$/;

const DOWNLOADS: Record<string, { api: string; file: string }> = {
  "/ZendoCoin-Polygon_Mainnet.zip": { api: "/api/download", file: "ZendoCoin-Polygon_Mainnet.zip" },
  "/ZendoL-1_App.zip": { api: "/api/download", file: "ZendoL-1_App.zip" },
  "/ZendoDeployL1.zip": { api: "/api/download", file: "ZendoDeployL1.zip" },
  "/ZendoL-1Ready.zip": { api: "/api/download", file: "ZendoL-1_App.zip" },
};

export async function proxy(req: NextRequest) {
  if (process.env.ZENDO_ROLE === "gateway") return proxyToShard(req);
  if (process.env.ZENDO_ROLE === "replica" && req.method !== "GET" && req.method !== "HEAD") return proxyToPrimary(req);
  const path = req.nextUrl.pathname;
  const history = HISTORY.exec(path);
  if (history) {
    const url = req.nextUrl.clone();
    url.pathname = "/api/wallet/history";
    url.searchParams.set("pass", history[1]);
    const headers = new Headers(req.headers);
    headers.set("x-zendo-file", history[2]);
    headers.set("x-zendo-pass", history[1]);
    return NextResponse.rewrite(url, { request: { headers } });
  }
  const pack = DOWNLOADS[path];
  if (pack) {
    const url = req.nextUrl.clone();
    url.pathname = pack.api;
    url.search = "";
    if (!pack.api.endsWith(pack.file)) url.searchParams.set("file", pack.file);
    const headers = new Headers(req.headers);
    headers.set("x-zendo-file", pack.file);
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (req.method === "OPTIONS" && path.startsWith("/api/")) return withCors(req, new NextResponse(null, { status: 204 }));
  const headers = new Headers(req.headers);
  headers.set("x-zendo-path", path);
  const next = () => withCors(req, NextResponse.next({ request: { headers } }));
  if (process.env.NODE_ENV !== "production") return next();
  if (req.nextUrl.pathname === "/api/health") return next();
  const host = (req.headers.get("host") || "").split(":")[0];
  const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (local) return next();
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "https" || req.nextUrl.protocol === "https:") return next();
  return new NextResponse("HTTPS is required.", { status: 403 });
}

async function proxyToShard(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/api/health" || path === "/api/fleet") return NextResponse.next();
  const urls = (process.env.ZENDO_SHARD_URLS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!urls.length) return new NextResponse("Set ZENDO_SHARD_URLS on the gateway.", { status: 503 });
  const pinned = Number(req.cookies.get("zendo_shard")?.value);
  const shard = Number.isInteger(pinned) && pinned >= 0 && pinned < urls.length ? pinned : bucket(`${req.headers.get("x-forwarded-for") || ""}:${req.headers.get("user-agent") || ""}`, urls.length);
  const target = new URL(`${path}${req.nextUrl.search}`, urls[shard]);
  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie", "authorization", "x-forwarded-for", "x-forwarded-proto"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();
  const upstream = await fetch(target, init);
  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "cache-control", "location", "set-cookie"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.append("set-cookie", `zendo_shard=${shard}; Path=/; HttpOnly; SameSite=Lax`);
  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}

async function proxyToPrimary(req: NextRequest) {
  const primary = (process.env.ZENDO_PRIMARY_URL || "").trim();
  if (!primary) return new NextResponse("Set ZENDO_PRIMARY_URL on this region.", { status: 503 });
  const target = new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, primary);
  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie", "authorization", "x-forwarded-for", "x-forwarded-proto"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: await req.arrayBuffer(),
    redirect: "manual",
  });
  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "cache-control", "location", "set-cookie"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}

function withCors(req: NextRequest, response: NextResponse) {
  const allow = publicOrigins();
  const origin = req.headers.get("origin");
  if (origin && allow.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Headers", "content-type, authorization");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  return response;
}

function bucket(text: string, count: number) {
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) sum = (sum + text.charCodeAt(i)) % count;
  return sum;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
