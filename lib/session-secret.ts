import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomHex } from "./ids";
import { dataDir } from "./paths";

/** Same secret on every app instance. The cookie is the session. There is no in-memory session table. */
export function sessionKey(): Uint8Array {
  const env = (process.env.ZENDO_JWT_SECRET || "").trim();
  if (env.length >= 32) return new TextEncoder().encode(env);
  const file = path.join(dataDir(), "jwt.secret");
  if (!existsSync(file)) {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(file, randomHex(32), { mode: 0o600 });
  }
  return new TextEncoder().encode(readFileSync(file, "utf8"));
}
