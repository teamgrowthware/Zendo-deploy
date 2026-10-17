import { createHash, createPrivateKey, createPublicKey, hkdfSync, sign as edSign, verify as edVerify } from "node:crypto";

export type L1Identity = {
  userId: string;
  publicKey: Buffer;
  address: string;
  sign: (message: Buffer) => Buffer;
};

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const DERIVE_DOMAIN = Buffer.from("zendo-1-l1-signer");
const DERIVE_SALT = Buffer.from("zendo-l1-master");

export function sha256(bytes: Buffer): Buffer {
  return createHash("sha256").update(bytes).digest();
}

export function addressFromPublic(publicKey: Buffer): string {
  if (publicKey.length !== 32) throw new Error("an L1 public key must be 32 bytes");
  return sha256(publicKey).subarray(0, 20).toString("hex");
}

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyEd25519(publicKey: Buffer, message: Buffer, signature: Buffer): boolean {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, publicKey]), format: "der", type: "spki" });
    return edVerify(null, message, key, signature);
  } catch {
    return false;
  }
}

export function identityFromSeed(userId: string, seed: Buffer): L1Identity {
  if (seed.length !== 32) throw new Error("the L1 seed must be 32 bytes");
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  if (!jwk.x) throw new Error("the L1 public key could not be exported");
  const publicKey = Buffer.from(jwk.x, "base64url");
  return {
    userId,
    publicKey,
    address: addressFromPublic(publicKey),
    sign: (message: Buffer) => Buffer.from(edSign(null, message, privateKey)),
  };
}

export function deriveSeed(masterSecret: Buffer, userId: string): Buffer {
  if (masterSecret.length < 16) throw new Error("the L1 master secret must be at least 16 bytes");
  const info = Buffer.concat([DERIVE_DOMAIN, Buffer.from(userId)]);
  return Buffer.from(hkdfSync("sha256", masterSecret, DERIVE_SALT, info, 32));
}

export function identityForUser(masterSecret: Buffer, userId: string): L1Identity {
  return identityFromSeed(userId, deriveSeed(masterSecret, userId));
}

const PHRASE_DOMAIN = "zendo-l1-seed:";

/**
 * Derives the user's own L1 identity from the recovery phrase they already hold. The phrase never
 * leaves the client, so the server never sees a private key. The derivation is stable across
 * restarts and matches for the same normalized phrase on every device.
 */
export function identityFromPhrase(userId: string, phrase: string): L1Identity {
  const normalized = phrase.trim().toLowerCase();
  if (normalized.length < 12) throw new Error("the recovery phrase is too short to derive an L1 signer");
  return identityFromSeed(userId, sha256(Buffer.from(PHRASE_DOMAIN + normalized, "utf8")));
}
