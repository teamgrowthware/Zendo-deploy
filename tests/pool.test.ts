import assert from "node:assert/strict";
import test from "node:test";

test("postgres pools stay bounded and the ledger indexes addresses, hashes, heights, and coins", async () => {
  process.env.ZENDO_PG_POOL_MAX = "8";
  const { ledgerIndexes, pgPoolMax } = await import("../lib/ledger-pg.ts");
  assert.equal(pgPoolMax(), 8);
  assert.equal(ledgerIndexes().length, 14);
  delete process.env.ZENDO_PG_POOL_MAX;
});
