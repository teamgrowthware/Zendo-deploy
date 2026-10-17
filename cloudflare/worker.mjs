import { validateEdgeEnvelope } from "./validate.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== "https:") return json({ ok: false, error: "HTTPS is required." }, 403);
    if (request.method === "GET" && (url.pathname === "/api/edge" || url.pathname === "/edge/health")) {
      return json({
        ok: true,
        service: "zendo-edge",
        tls: true,
        cloudflare: true,
        checks: ["tls", "routing"],
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      const length = Number(request.headers.get("content-length") || "0");
      if (length > 1_000_000) return json({ ok: false, error: "Request body is too large." }, 413);
      const type = request.headers.get("content-type") || "";
      if (url.pathname.startsWith("/api/") && !type.includes("application/json")) {
        return json({ ok: false, error: "API writes require application/json." }, 415);
      }
    }
    if (request.method === "POST" && url.pathname === "/api/edge") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, action: null, errors: ["Body must be a JSON object."] }, 400);
      }
      const verdict = validateEdgeEnvelope(body);
      if (!verdict.ok) return json(verdict, 400);
      if (!env.ORIGIN) return json({ ...verdict, forwarded: false });
    }
    if (!env.ORIGIN) return json({ ok: false, error: "ORIGIN is not set on the edge worker." }, 502);
    const target = new URL(`${url.pathname}${url.search}`, env.ORIGIN);
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-proto", "https");
    headers.set("x-zendo-edge-verified", "1");
    return fetch(target, { method: request.method, headers, body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body });
  },
};

export default worker;
