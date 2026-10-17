import { ZendoError } from "../errors";
import { logEvent } from "../log";
import { L1Client } from "./client";
import { custodialSigningAllowed, signerForUser } from "./config";
import type { TxInput } from "./operations";
import { relay, settle, type Settled } from "./settlement";
import { verifyL1Tx } from "./verify";

export type SettleRouteInput = {
  userId: string;
  /** The client-signed transaction. In production this is required. */
  tx: unknown;
  /** Builds the operation for the DEV/TEST server-signed fallback only. */
  build: () => TxInput | Promise<TxInput>;
  fee?: bigint;
  /** Optional read-model mirror, run only after the chain has finalized. */
  mirror?: () => unknown | Promise<unknown>;
  timeoutMs?: number;
};

export type SettledRoute = Settled & { mirrored: boolean };

/**
 * The one path every financial API route goes through. It prefers a client-signed transaction (the
 * signature is the authorization), falls back to the DEV/TEST server signer only when explicitly
 * allowed, and refuses otherwise. The read-model mirror runs only after finality, and a mirror
 * failure is logged but never turns a confirmed chain result into a client error.
 */
export async function settleRoute(input: SettleRouteInput): Promise<SettledRoute> {
  const client = L1Client.fromEnv();
  const timeoutMs = input.timeoutMs ?? 20_000;

  let settled: Settled;
  if (input.tx !== undefined && input.tx !== null) {
    settled = await relay(client, verifyL1Tx(input.tx), { timeoutMs });
  } else if (custodialSigningAllowed()) {
    const identity = signerForUser(input.userId);
    settled = await settle(client, identity, await input.build(), { fee: input.fee ?? 10_000n, timeoutMs });
  } else {
    throw new ZendoError("Sign this transaction on your device and post the signed L1 transaction.", 401, "signature");
  }

  let mirrored = false;
  if (input.mirror) {
    try {
      await input.mirror();
      mirrored = true;
    } catch (error) {
      logEvent("read_model_mirror_failed", {
        id: settled.id,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return { ...settled, mirrored };
}
