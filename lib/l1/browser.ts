import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

import type { L1Tx } from "./tx";

/**
 * Browser-safe twin of `crypto.ts` / `tx.ts`. It derives the same key, address, message hash, and
 * signature as the node implementation, but uses `@noble` primitives instead of `node:crypto`, so a
 * wallet page can sign a zendo-1 transaction in the browser without the recovery phrase ever leaving
 * the device. The tests pin both implementations to the same vector.
 */
export type BrowserIdentity = {
  userId: string;
  publicKey: Uint8Array;
  address: string;
  sign: (message: Uint8Array) => Uint8Array;
};

const text = new TextEncoder();
const TRANSFER_DOMAIN = text.encode("ZENDO_TX_V1");
const DATA_DOMAIN = text.encode("ZENDO_TX_V2");
const PHRASE_DOMAIN = "zendo-l1-seed:";

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error("hex is malformed");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function encodeU64(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("an L1 nonce must be a whole number");
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value & 0xffffffffffffffffn, true);
  return out;
}

function encodeU128(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("an L1 amount must be a whole number");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  return out;
}

export function addressFromPublic(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new Error("an L1 public key must be 32 bytes");
  return toHex(nobleSha256(publicKey).subarray(0, 20));
}

function identity(userId: string, seed: Uint8Array): BrowserIdentity {
  if (seed.length !== 32) throw new Error("the L1 seed must be 32 bytes");
  const publicKey = ed25519.getPublicKey(seed);
  return {
    userId,
    publicKey,
    address: addressFromPublic(publicKey),
    sign: (message: Uint8Array) => ed25519.sign(message, seed),
  };
}

/** Derives the user's own signer from the recovery phrase they already hold. */
export function identityFromPhrase(userId: string, phrase: string): BrowserIdentity {
  const normalized = phrase.trim().toLowerCase();
  if (normalized.length < 12) throw new Error("the recovery phrase is too short to derive an L1 signer");
  return identity(userId, nobleSha256(text.encode(PHRASE_DOMAIN + normalized)));
}

export function identityFromSeed(userId: string, seed: Uint8Array): BrowserIdentity {
  return identity(userId, seed);
}

export function txMessage(from: Uint8Array, nonce: number, to: Uint8Array, amount: bigint | string | number, fee: bigint | string | number, data?: Uint8Array): Uint8Array {
  const head = concat([from, encodeU64(BigInt(nonce)), to, encodeU128(BigInt(amount)), encodeU128(BigInt(fee))]);
  const body = data && data.length > 0 ? concat([DATA_DOMAIN, head, data]) : concat([TRANSFER_DOMAIN, head]);
  return nobleSha256(body);
}

export function signTx(
  identity: BrowserIdentity,
  input: { nonce: number; to: string; amount: bigint | string | number; fee: bigint | string | number; data?: Uint8Array },
): L1Tx {
  const to = fromHex(input.to);
  if (to.length !== 20) throw new Error("an L1 address must be 20 bytes");
  const message = txMessage(identity.publicKey, input.nonce, to, input.amount, input.fee, input.data);
  return {
    from: toHex(identity.publicKey),
    nonce: input.nonce,
    to: toHex(to),
    amount: BigInt(input.amount).toString(),
    fee: BigInt(input.fee).toString(),
    signature: toHex(identity.sign(message)),
    data: input.data && input.data.length > 0 ? toHex(input.data) : "",
  };
}

/**
 * The exact bytes a client signs to prove it holds a wallet key during signup or recovery. This must
 * match `proofDigest` in the server engine byte for byte; the domain separator keeps the two proofs
 * from being interchangeable.
 */
export function proofMessage(domain: "zendo-signup" | "zendo-recover", challenge: string): Uint8Array {
  return text.encode(`${domain}:${challenge}`);
}

export function signProof(identity: BrowserIdentity, domain: "zendo-signup" | "zendo-recover", challenge: string): string {
  return toHex(identity.sign(proofMessage(domain, challenge)));
}

/** Picks a fresh recovery phrase straight from a word list in the browser, with no server involved. */
export function generateClientPhrase(wordlist: string[], count = 12): string[] {
  if (wordlist.length < count) throw new Error("the word list is too short to build a phrase");
  const picks = new Set<string>();
  while (picks.size < count) {
    const buffer = new Uint32Array(32);
    crypto.getRandomValues(buffer);
    for (const value of buffer) {
      picks.add(wordlist[value % wordlist.length]);
      if (picks.size === count) break;
    }
  }
  return [...picks];
}

