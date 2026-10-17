import assert from "node:assert/strict";
import test from "node:test";

test("postgres stores the same app ledger and keeps concurrent credits", async (t) => {
  const databaseUrl = (process.env.ZENDO_TEST_DATABASE_URL || "").trim();
  if (!databaseUrl) {
    t.skip("Set ZENDO_TEST_DATABASE_URL to run PostgreSQL integration coverage.");
    return;
  }
  process.env.ZENDO_DISABLE_TIMER = "1";
  process.env.ZENDO_DATABASE_URL = databaseUrl;
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const { ZENDO_OPERATOR } = await import("../lib/seed.ts");
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const dest = `znd1${"56".repeat(19)}`;
  await Promise.all([
    engine.send(operator.id, dest, "ZCOIN", "1"),
    engine.send(operator.id, dest, "ZCOIN", "1"),
    engine.send(operator.id, dest, "ZCOIN", "1"),
  ]);
  const supply = await engine.auditSupply();
  assert.equal(supply.ok, true, `${supply.accounted} vs ${supply.supply}`);
  const { addBalancePg, readBalancePg, closePostgres } = await import("../lib/ledger-pg.ts");
  const address = `znd1${"78".repeat(19)}`;
  await Promise.all(Array.from({ length: 8 }, () => addBalancePg(address, "ZCOIN", 25n)));
  process.env.ZENDO_DATABASE_REPLICA_URL = (process.env.ZENDO_TEST_DATABASE_REPLICA_URL || databaseUrl).trim();
  assert.equal(await readBalancePg(address, "ZCOIN"), "200");
  const { countTransfersPg } = await import("../lib/ledger-pg.ts");
  assert.equal(await countTransfersPg(), 6);
  const edge = await import("../app/api/edge/route.ts");
  const health = await edge.GET(new Request("http://127.0.0.1:38471/api/edge", { headers: { host: "127.0.0.1:38471" } }));
  const body = await health.json();
  assert.equal(body.ledger, "postgres");
  await closePostgres();
  delete process.env.ZENDO_DATABASE_URL;
  delete process.env.ZENDO_DATABASE_REPLICA_URL;
});
