import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const databaseUrl = (process.env.ZENDO_DATABASE_URL || "").trim();
if (!databaseUrl) {
  console.error("ZENDO_DATABASE_URL is required to run PostgreSQL migrations.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  console.error("ZENDO_DATABASE_URL must be a valid PostgreSQL connection URL.");
  process.exit(1);
}
if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
  console.error("ZENDO_DATABASE_URL must use the postgres or postgresql protocol.");
  process.exit(1);
}

const dir = path.join(process.cwd(), "db", "postgres");
const migrations = (await readdir(dir)).filter((name) => /^\d+_[\w-]+\.sql$/.test(name)).sort();
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, application_name: "zendo-migrate" });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS zendo_schema_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  for (const id of migrations) {
    const sql = await readFile(path.join(dir, id), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await pool.query("SELECT checksum FROM zendo_schema_migrations WHERE id = $1", [id]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Migration checksum changed: ${id}`);
      console.log(`already applied ${id}`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO zendo_schema_migrations (id, checksum) VALUES ($1, $2)", [id, checksum]);
      await client.query("COMMIT");
      console.log(`applied ${id}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
