import assert from "node:assert/strict";
import test from "node:test";
import worker from "../cloudflare/worker.mjs";
import { GET, POST } from "../app/api/edge/route.ts";

test("the edge worker requires https and validates a withdrawal", async () => {
  const insecure = await worker.fetch(new Request("http://zendo.example/api/edge"), {});
  assert.equal(insecure.status, 403);
  const health = await worker.fetch(new Request("https://zendo.example/api/edge"), {});
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.ok, true);
  assert.equal(body.tls, true);
  const rejected = await worker.fetch(new Request("https://zendo.example/api/edge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "withdraw", recipient: "nope", amount: "1" }),
  }), {});
  assert.equal(rejected.status, 400);
  const accepted = await worker.fetch(new Request("https://zendo.example/api/edge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "withdraw", recipient: `0x${"ab".repeat(20)}`, amount: "1.5" }),
  }), {});
  const verdict = await accepted.json();
  assert.equal(verdict.ok, true);
  assert.equal(verdict.forwarded, false);
});

test("the origin edge route reports sqlite and checks the envelope", async () => {
  const health = await GET(new Request("http://127.0.0.1:38471/api/edge", { headers: { host: "127.0.0.1:38471" } }));
  const body = await health.json();
  assert.equal(body.ok, true);
  assert.equal(body.ledger, "sqlite");
  assert.equal(body.tls, true);
  const bad = await POST(new Request("http://127.0.0.1:38471/api/edge", {
    method: "POST",
    headers: { "content-type": "application/json", host: "127.0.0.1:38471" },
    body: JSON.stringify({ action: "deposit" }),
  }));
  assert.equal(bad.status, 400);
});
