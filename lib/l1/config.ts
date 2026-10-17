import { identityForUser, L1Identity } from "./crypto";

/**
 * Custodial signing derives every user's L1 key from one server secret. It is only safe for local
 * development and tests. Production must sign with the user's own recovery phrase on the client,
 * so this path is disabled unless it is explicitly switched on outside production.
 */
export function custodialSigningAllowed(): boolean {
  if (process.env.ZENDO_L1_ALLOW_CUSTODIAL === "1") return true;
  return process.env.NODE_ENV === "test";
}

/**
 * Simulated/DB-only settlement, fake mining, synthetic credits and the debug helpers may never run in
 * production. They exist so local development and tests can exercise flows without a live L1 node.
 * They are refused unless the process is explicitly non-production or the operator opts in.
 */
export function simulationAllowed(): boolean {
  if (process.env.ZENDO_L1_ALLOW_SIMULATION === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export function assertSimulationAllowed(what: string): void {
  if (!simulationAllowed()) {
    throw new Error(`${what} is a DEV/TEST-only path and is disabled in production.`);
  }
}

export function masterSecretFromEnv(): Buffer {
  const raw = (process.env.ZENDO_L1_MASTER_SECRET || "").trim();
  if (!raw) {
    throw new Error("Set ZENDO_L1_MASTER_SECRET to a hex or base64 secret before the app can sign L1 transactions.");
  }
  const hex = /^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0;
  const secret = hex ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (secret.length < 16) throw new Error("ZENDO_L1_MASTER_SECRET must decode to at least 16 bytes.");
  return secret;
}

/**
 * A DEV/TEST-only signer. It throws in production so no user's coins can ever be signed by a single
 * server key. Use `identityFromPhrase` on the client instead.
 */
export function signerForUser(userId: string): L1Identity {
  if (!custodialSigningAllowed()) {
    throw new Error("Custodial L1 signing is disabled. Sign with the user's recovery phrase on the client.");
  }
  return identityForUser(masterSecretFromEnv(), userId);
}

export function rpcUrlFromEnv(): string {
  return (process.env.ZENDO_L1_RPC || "http://127.0.0.1:47111").trim();
}
