import { L1Client, Receipt } from "./client";
import { L1Identity } from "./crypto";
import { signTx, txId, type L1Tx } from "./tx";
import { TxInput } from "./operations";

export type Settled = {
  id: string;
  height: number;
  finalized: boolean;
  receipt: Receipt;
};

export type SettleOptions = {
  /** Gas fee in base units. The node charges it whether the call succeeds or reverts. */
  fee?: bigint;
  /** How long to wait for block inclusion, then for the block to finalize. */
  timeoutMs?: number;
  pollMs?: number;
};

/**
 * Submits a signed operation and waits until the node has included it in a block and that block has
 * finalized. It throws on every failure path, so a caller can never mistake a database write for a
 * settled transfer. The user's key signs here; the node is the only authority on the outcome.
 */
export async function settle(
  client: L1Client,
  identity: L1Identity,
  input: TxInput,
  options: SettleOptions = {},
): Promise<Settled> {
  const nonce = await client.nonce(identity.address);
  const fee = options.fee ?? 10_000n;
  const tx = signTx(identity, { nonce, to: input.to, amount: input.amount, fee, data: input.data });
  const id = txId(tx);
  const accepted = await client.submit(tx);
  if (!accepted.accepted) throw new Error(`the node rejected transaction ${id}`);
  return confirm(client, id, options);
}

/**
 * Relays an already-signed transaction (the client signed it, the server only forwards it) and waits
 * for block inclusion and finality. It throws on every failure path, so the caller can never report a
 * settled result the chain has not confirmed.
 */
export async function relay(client: L1Client, tx: L1Tx, options: SettleOptions = {}): Promise<Settled> {
  const id = txId(tx);
  const accepted = await client.submit(tx);
  if (!accepted.accepted) throw new Error(`the node rejected transaction ${id}`);
  return confirm(client, id, options);
}

/** Waits for a known transaction id to be included in a block and for that block to finalize. */
export async function confirm(client: L1Client, id: string, options: SettleOptions = {}): Promise<Settled> {
  const receipt = await client.waitForReceipt(id, options);
  if (receipt.height === null) throw new Error(`transaction ${id} never reached a block`);
  const finalizedAt = await waitForFinality(client, receipt.height, options);
  return { id, height: receipt.height, finalized: finalizedAt, receipt };
}

async function waitForFinality(client: L1Client, height: number, options: SettleOptions): Promise<boolean> {
  const deadline = Date.now() + (options.timeoutMs ?? 20_000);
  const pollMs = options.pollMs ?? 400;
  for (;;) {
    if ((await client.finalized()) >= height) return true;
    if (Date.now() > deadline) throw new Error(`block ${height} was included but not finalized before the deadline`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** Reads the authoritative native balance straight from the node as base units. */
export async function onChainBalance(client: L1Client, address: string): Promise<bigint> {
  return BigInt(await client.balance(address));
}
