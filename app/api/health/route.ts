import { status } from "@/lib/engine";
import { placement } from "@/lib/fleet";
import { logEvent } from "@/lib/log";

export async function GET() {
  try {
    const here = placement();
    if (here.role === "gateway") {
      return Response.json({ ok: true, role: "gateway", shards: here.urls.length });
    }
    const chain = await status();
    return Response.json({
      ok: true,
      network: chain.networkId,
      height: chain.height,
      finalizedHeight: chain.finalizedHeight,
      mempool: chain.mempool,
    });
  } catch (error) {
    logEvent("health_failed", { message: error instanceof Error ? error.message : "unknown" });
    return Response.json({ ok: false }, { status: 503 });
  }
}
