import assert from "node:assert/strict";
import test from "node:test";

test("cross-origin access is the one public origin", async () => {
  const previous = process.env.ZENDO_PUBLIC_ORIGIN;
  process.env.ZENDO_PUBLIC_ORIGIN = "https://zendo.example";
  const { publicOrigins } = await import("../lib/cors.ts");
  assert.deepEqual(publicOrigins(), ["https://zendo.example"]);
  process.env.ZENDO_PUBLIC_ORIGIN = "*";
  assert.deepEqual(publicOrigins(), []);
  process.env.ZENDO_PUBLIC_ORIGIN = "http://evil.example";
  assert.deepEqual(publicOrigins(), []);
  if (previous === undefined) delete process.env.ZENDO_PUBLIC_ORIGIN;
  else process.env.ZENDO_PUBLIC_ORIGIN = previous;
});
