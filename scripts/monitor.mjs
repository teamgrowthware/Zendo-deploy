const base = process.env.ZENDO_URL || "http://127.0.0.1:38471";

const health = await fetch(`${base}/api/health`);
const body = await health.json().catch(() => ({}));
if (!health.ok || body.ok !== true) {
  console.error("node health failed", health.status, body);
  process.exit(1);
}

const rpc = await fetch(`${base}/api/rpc`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "zendo_blockNumber", params: [] }),
});
const payload = await rpc.json().catch(() => ({}));
if (!rpc.ok || payload.result === undefined) {
  console.error("rpc check failed", rpc.status, payload);
  process.exit(1);
}

console.log(JSON.stringify({ network: body.network, height: body.height, rpc: payload.result }));
