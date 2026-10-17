import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";

function postgresUp(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(5432, "127.0.0.1");
    const done = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

test("postgres stores the same app ledger and keeps concurrent credits", async (t) => {
  if (!(await postgresUp())) {
    t.skip("PostgreSQL is not listening on 127.0.0.1:5432");
    return;
  }
  process.env.ZENDO_DISABLE_TIMER = "1";
  process.env.ZENDO_DATABASE_URL = "postgres://zendo:zendo@127.0.0.1:5432/zendo";
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
  process.env.ZENDO_DATABASE_REPLICA_URL = "postgres://zendo:zendo@127.0.0.1:5432/zendo?application_name=zendo-read";
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
