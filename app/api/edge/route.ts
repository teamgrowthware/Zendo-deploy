import { validateEdgeEnvelope } from "../../../cloudflare/validate.mjs";
import { bridgeSettings } from "@/lib/bridge-proof";
import { usingPostgres } from "@/lib/ledger-pg";
import { polygonConfigured } from "@/lib/polygon-receipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const host = (req.headers.get("host") || "").split(":")[0];
  const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "";
  return Response.json({
    ok: true,
    service: "zendo-edge",
    ledger: usingPostgres() ? "postgres" : "sqlite",
    tls: proto === "https" || local,
    cloudflare: Boolean(req.headers.get("cf-ray")),
    polygon: polygonConfigured(),
    bridge: bridgeSettings().ready,
  });
}

export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const verdict = validateEdgeEnvelope(body);
  return Response.json(verdict, { status: verdict.ok ? 200 : 400 });
}
