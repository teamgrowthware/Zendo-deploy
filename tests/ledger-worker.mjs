import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";

const db = new DatabaseSync(workerData.file);
db.exec("PRAGMA busy_timeout = 5000");
for (let i = 0; i < workerData.count; i += 1) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT amount FROM balances WHERE address = ? AND asset = ?").get(workerData.address, "ZCOIN");
    const next = BigInt(row?.amount || "0") + 1n;
    db.prepare(
      "INSERT INTO balances (address, asset, amount) VALUES (?, 'ZCOIN', ?) ON CONFLICT(address, asset) DO UPDATE SET amount = excluded.amount",
    ).run(workerData.address, next.toString());
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}
db.close();
parentPort.postMessage("ok");
