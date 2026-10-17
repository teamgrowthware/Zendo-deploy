import { readSession } from "@/lib/auth";
import { rpc } from "@/lib/engine";
import { ZendoError } from "@/lib/errors";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = body && typeof body === "object" && "id" in body ? (body as { id?: unknown }).id ?? null : null;
  try {
    if (!body || typeof body !== "object" || typeof (body as { method?: unknown }).method !== "string") {
      throw new ZendoError("JSON-RPC body needs a method.");
    }
    const method = (body as { method: string }).method;
    const params = Array.isArray((body as { params?: unknown }).params) ? (body as { params: unknown[] }).params : [];
    const session = await readSession();
    const result = await rpc(method, params, session?.sub ?? null);
    return Response.json({ jsonrpc: "2.0", id, result });
  } catch (error) {
    const message = error instanceof ZendoError ? error.message : "RPC failed.";
    const code = error instanceof ZendoError ? error.status : 500;
    return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: code === 429 ? 429 : 200 });
  }
}
