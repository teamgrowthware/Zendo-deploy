import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SignJWT, jwtVerify } from "jose";

test("a shared secret verifies the session cookie on any instance", async () => {
  process.env.ZENDO_JWT_SECRET = "h".repeat(32);
  const { sessionKey } = await import("../lib/session-secret.ts");
  const key = sessionKey();
  const token = await new SignJWT({ purpose: "session", sv: 1 }).setProtectedHeader({ alg: "HS256" }).setSubject("usr_operator").sign(key);
  const { payload } = await jwtVerify(token, sessionKey());
  assert.equal(payload.sub, "usr_operator");
});

test("account hashes stay on one shard and writes keep the primary url", async () => {
  process.env.ZENDO_SHARD_COUNT = "4";
  process.env.ZENDO_DATABASE_URL = "postgres://primary/zendo";
  process.env.ZENDO_DATABASE_REPLICA_URL = "postgres://replica/zendo";
  const { accountShard, ownsAccount, readDatabaseUrl, writeDatabaseUrl } = await import("../lib/db-route.ts");
  const id = `znd1${"ab".repeat(19)}`;
  assert.equal(accountShard(id), accountShard(id));
  assert.ok(accountShard(id) >= 0 && accountShard(id) < 4);
  process.env.ZENDO_SHARD_INDEX = String(accountShard(id));
  assert.equal(ownsAccount(id), true);
  process.env.ZENDO_SHARD_INDEX = String((accountShard(id) + 1) % 4);
  assert.equal(ownsAccount(id), false);
  assert.equal(writeDatabaseUrl(), "postgres://primary/zendo");
  assert.equal(readDatabaseUrl(), "postgres://replica/zendo");
  delete process.env.ZENDO_SHARD_COUNT;
  delete process.env.ZENDO_SHARD_INDEX;
  delete process.env.ZENDO_DATABASE_URL;
  delete process.env.ZENDO_DATABASE_REPLICA_URL;
});

test("jobs queue locally until a redis stream is configured", async () => {
  delete process.env.ZENDO_REDIS_URL;
  delete process.env.REDIS_URL;
  const { publishJob, pendingJobs } = await import("../lib/queue.ts");
  const id = await publishJob("ledger-commit", { height: "3" });
  assert.equal(id, "local");
  assert.equal(pendingJobs().at(-1)?.kind, "ledger-commit");
});

test("a gateway stops accepting streams at its cap", async () => {
  process.env.ZENDO_CONNECTION_CAP = "2";
  const connections = await import("../lib/connections.ts");
  assert.equal(connections.acquireConnection(), true);
  assert.equal(connections.acquireConnection(), true);
  assert.equal(connections.acquireConnection(), false);
  connections.releaseConnection();
  assert.equal(connections.acquireConnection(), true);
  connections.releaseConnection();
  connections.releaseConnection();
  delete process.env.ZENDO_CONNECTION_CAP;
});

test("a bridge key file must be mode 0600", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "zendo-key-"));
  const loose = path.join(dir, "loose.key");
  const tight = path.join(dir, "tight.key");
  writeFileSync(loose, "aa", { mode: 0o644 });
  writeFileSync(tight, "aa", { mode: 0o600 });
  const { assertPrivateFileMode } = await import("../lib/bridge-proof.ts");
  assert.throws(() => assertPrivateFileMode(loose), /0600/);
  assert.doesNotThrow(() => assertPrivateFileMode(tight));
  assert.doesNotThrow(() => assertPrivateFileMode(path.join(dir, "missing.key")));
});
