import { ZendoError } from "../errors";
import { L1Identity, addressFromPublic, verifyEd25519 } from "./crypto";
import { L1Tx, toAddressBytes, txMessage } from "./tx";

const HEX = /^[0-9a-fA-F]+$/;

function fixedHex(value: unknown, bytes: number, field: string): string {
  if (typeof value !== "string" || value.length !== bytes * 2 || !HEX.test(value)) {
    throw new ZendoError(`${field} must be ${bytes} bytes of hex.`, 400, "malformed");
  }
  return value.toLowerCase();
}

function units(value: unknown, field: string): string {
  const text = typeof value === "bigint" ? value.toString() : typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^[0-9]+$/.test(text)) throw new ZendoError(`${field} must be a whole number of base units.`, 400, "malformed");
  return BigInt(text).toString();
}

function dataHex(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length % 2 !== 0 || !HEX.test(value)) {
    throw new ZendoError("data must be even-length hex.", 400, "malformed");
  }
  return value.toLowerCase();
}

/**
 * Validates a client-signed L1 transaction before the server relays it. The signature is the whole
 * authorization: a valid Ed25519 signature over the canonical ZENDO message proves the sender
 * approved this exact nonce, recipient, amount, fee, and calldata, so no server-held key is needed.
 */
export function verifyL1Tx(input: unknown): L1Tx {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ZendoError("A signed L1 transaction object is required.", 400, "malformed");
  }
  const raw = input as Record<string, unknown>;
  const from = fixedHex(raw.from, 32, "from");
  const to = fixedHex(raw.to, 20, "to");
  const signature = fixedHex(raw.signature, 64, "signature");
  const nonce = raw.nonce;
  if (typeof nonce !== "number" || !Number.isInteger(nonce) || nonce < 0 || nonce > Number.MAX_SAFE_INTEGER) {
    throw new ZendoError("nonce must be a non-negative whole number.", 400, "malformed");
  }
  const amount = units(raw.amount, "amount");
  const fee = units(raw.fee, "fee");
  const data = dataHex(raw.data);

  const publicKey = Buffer.from(from, "hex");
  const message = txMessage(publicKey, nonce, toAddressBytes(to), amount, fee, data ? Buffer.from(data, "hex") : undefined);
  if (!verifyEd25519(publicKey, message, Buffer.from(signature, "hex"))) {
    throw new ZendoError("the transaction signature does not match the sender.", 401, "signature");
  }
  return { from, nonce, to, amount, fee, signature, data };
}

/** The 20-byte L1 address that controls this transaction, derived from its sender public key. */
export function senderAddress(tx: L1Tx): string {
  return addressFromPublic(Buffer.from(tx.from, "hex"));
}

/** The address a transaction came from, for scoping read-model updates to the signed sender. */
export function addressOf(identity: L1Identity): string {
  return identity.address;
}
