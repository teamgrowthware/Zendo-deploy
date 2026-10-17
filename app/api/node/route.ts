export const dynamic = "force-dynamic";

type RpcOk = { result?: unknown; error?: { message?: string } };

function nodeUrl(): string {
  const raw = process.env.ZENDO_L1_RPC || "http://127.0.0.1:47111";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ZENDO_L1_RPC is not a URL.");
  }
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) {
    throw new Error("ZENDO_L1_RPC must be an http URL on localhost for the explorer proxy.");
  }
  return url.origin;
}

const READ_METHODS = new Set([
  "zendo_chainId",
  "zendo_blockNumber",
  "zendo_finalized",
  "zendo_consensus",
  "zendo_peers",
  "zendo_validators",
  "zendo_slashes",
  "zendo_staking",
  "zendo_governance",
  "zendo_call",
  "zendo_getBalance",
  "zendo_getCode",
  "zendo_getStorage",
  "zendo_getBlockByHeight",
]);

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(nodeUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(800),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Node RPC returned ${response.status}.`);
  const body = (await response.json()) as RpcOk;
  if (body.error) throw new Error(body.error.message || "Node RPC error.");
  return body.result;
}

async function optional(method: string) {
  try {
    return await rpc(method);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { method?: string; params?: unknown[] } | null;
  const method = body?.method || "";
  if (!READ_METHODS.has(method)) {
    return Response.json({ error: "That node method is not proxied." }, { status: 400 });
  }
  try {
    const result = await rpc(method, Array.isArray(body?.params) ? body.params : []);
    return Response.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The local node RPC is not reachable.";
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  try {
    const [chainId, consensus, peers, validators, slashes, staking] = await Promise.all([
      rpc("zendo_chainId"),
      rpc("zendo_consensus"),
      rpc("zendo_peers"),
      optional("zendo_validators"),
      optional("zendo_slashes"),
      optional("zendo_staking"),
    ]);
    return Response.json({ ok: true, chainId, consensus, peers, validators, slashes, staking });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The local node RPC is not reachable.";
    return Response.json({
      ok: false,
      error: message.includes("fetch") || message.includes("timed") || message.includes("ECONN")
        ? "The local node RPC is not reachable. Start zendo-node to fill this panel."
        : message,
    });
  }
}
