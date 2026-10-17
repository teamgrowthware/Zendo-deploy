import { ledgerSnapshot } from "@/lib/engine";
import { placement } from "@/lib/fleet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const here = placement();
  if (!here.fleetSecret) {
    return Response.json({ ok: false, error: "Set ZENDO_FLEET_SECRET before a replica can copy the ledger." }, { status: 404 });
  }
  if (here.role === "replica") {
    return Response.json({ ok: false, error: "Replicas copy the primary. They do not publish the ledger." }, { status: 409 });
  }
  if (req.headers.get("authorization") !== `Bearer ${here.fleetSecret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const body = await ledgerSnapshot();
  return new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
