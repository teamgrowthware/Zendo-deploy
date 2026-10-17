import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ZendoError } from "./errors";
import { dataDir } from "./paths";

export const RELEASE_TAG = "ZENDO_RELEASE_V1";
const LOCKED_EVENT = "Locked(address,bytes32,uint256,uint256)";

const SECP_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const HALF_N = SECP_N / 2n;

export const LOCKED_TOPIC = `0x${Buffer.from(keccak_256(new TextEncoder().encode(LOCKED_EVENT))).toString("hex")}`;

export type ReleaseVoucher = {
  chainId: number;
  bridge: string;
  recipient: string;
  amount: bigint;
  nonce: bigint;
  innerHash: string;
  signature: string;
  signer: string;
};

export type ParsedLock = {
  txHash: string;
  logIndex: number;
  zendoHash: string;
  amount: bigint;
  nonce: bigint;
};

export type ObservedLock = ParsedLock & { blockNumber: bigint };

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u256(value: bigint): Uint8Array {
  if (value < 0n || value >= 2n ** 256n) throw new ZendoError("Amount is outside uint256.", 400, "malformed");
  const out = new Uint8Array(32);
  let rest = value;
  for (let i = 31; i >= 0; i -= 1) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

export function parsePolygonAddress(value: unknown, label = "Polygon address"): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value.trim())) {
    throw new ZendoError(`${label} must be a 0x address with 40 hex characters.`);
  }
  return value.trim().toLowerCase();
}

function addressBytes(hex: string): Uint8Array {
  return Buffer.from(parsePolygonAddress(hex).slice(2), "hex");
}

function parseKey(raw: string): Uint8Array {
  const hex = raw.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ZendoError("The bridge signing key must be 32 bytes of hex.");
  }
  const bytes = Buffer.from(hex, "hex");
  const scalar = BigInt(`0x${hex}`);
  if (scalar === 0n || scalar >= SECP_N) throw new ZendoError("The bridge signing key is not on the curve.");
  return new Uint8Array(bytes);
}

export function assertPrivateFileMode(file: string) {
  if (!existsSync(file)) return;
  const mode = statSync(file).mode & 0o777;
  if (mode !== 0o600) throw new ZendoError("The bridge key file must be mode 0600.");
}

export function bridgeSettings() {
  const chainRaw = process.env.ZENDO_POLYGON_CHAIN_ID || "137";
  const chainId = Number(chainRaw);
  const bridgeRaw = (process.env.ZENDO_POLYGON_BRIDGE || "").trim();
  const keyRaw = (process.env.ZENDO_BRIDGE_PRIVATE_KEY || "").trim();
  const keyFile = path.join(dataDir(), "bridge.key");
  const bridge = /^0x[0-9a-fA-F]{40}$/.test(bridgeRaw) ? bridgeRaw.toLowerCase() : "";
  const chainOk = Number.isInteger(chainId) && chainId > 0 && chainId < 2 ** 53;
  let secret: Uint8Array | null = null;
  let signer = "";
  if (keyRaw) secret = parseKey(keyRaw);
  else if (existsSync(keyFile)) {
    assertPrivateFileMode(keyFile);
    secret = parseKey(readFileSync(keyFile, "utf8"));
  }
  if (secret) signer = ethAddress(secret);
  return {
    chainId: chainOk ? chainId : 0,
    bridge,
    signer,
    secret,
    ready: Boolean(bridge && secret && chainOk),
  };
}

export function ethAddress(secret: Uint8Array): string {
  const pub = secp256k1.getPublicKey(secret, false);
  const hash = keccak_256(pub.subarray(1));
  return `0x${Buffer.from(hash.subarray(12)).toString("hex")}`;
}

export function zendoAccountHash(address: string): string {
  if (!/^znd1[0-9a-f]{38}$/.test(address)) throw new ZendoError("That is not a znd1 address.", 400, "malformed");
  return `0x${Buffer.from(keccak_256(new TextEncoder().encode(address))).toString("hex")}`;
}

function innerRelease(chainId: number, bridge: string, recipient: string, amount: bigint, nonce: bigint): Uint8Array {
  return keccak_256(
    concat([
      new TextEncoder().encode(RELEASE_TAG),
      u256(BigInt(chainId)),
      addressBytes(bridge),
      addressBytes(recipient),
      u256(amount),
      u256(nonce),
    ]),
  );
}

function ethereumDigest(inner: Uint8Array): Uint8Array {
  return keccak_256(concat([new TextEncoder().encode("\x19Ethereum Signed Message:\n32"), inner]));
}

export function signRelease(input: {
  chainId: number;
  bridge: string;
  recipient: string;
  amount: bigint;
  nonce: bigint;
  secret: Uint8Array;
}): ReleaseVoucher {
  const inner = innerRelease(input.chainId, input.bridge, input.recipient, input.amount, input.nonce);
  const digest = ethereumDigest(inner);
  const signed = secp256k1.sign(digest, input.secret, { prehash: false, format: "recovered" });
  if (signed.length !== 65) throw new ZendoError("The bridge signature was not 65 bytes.", 500, "signature");
  const recovery = signed[0];
  const r = signed.subarray(1, 33);
  const s = signed.subarray(33, 65);
  const sInt = BigInt(`0x${Buffer.from(s).toString("hex")}`);
  if (recovery > 1 || sInt === 0n || sInt > HALF_N) {
    throw new ZendoError("The bridge signature was rejected.", 500, "signature");
  }
  const packed = concat([r, s, Uint8Array.of(27 + recovery)]);
  return {
    chainId: input.chainId,
    bridge: parsePolygonAddress(input.bridge, "Bridge contract"),
    recipient: parsePolygonAddress(input.recipient, "Polygon recipient"),
    amount: input.amount,
    nonce: input.nonce,
    innerHash: `0x${Buffer.from(inner).toString("hex")}`,
    signature: `0x${Buffer.from(packed).toString("hex")}`,
    signer: ethAddress(input.secret),
  };
}

export function verifyRelease(voucher: ReleaseVoucher): boolean {
  const inner = Buffer.from(voucher.innerHash.replace(/^0x/, ""), "hex");
  if (inner.length !== 32) return false;
  const expected = Buffer.from(innerRelease(voucher.chainId, voucher.bridge, voucher.recipient, voucher.amount, voucher.nonce));
  if (!expected.equals(inner)) return false;
  const raw = voucher.signature.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{130}$/.test(raw)) return false;
  const bytes = Buffer.from(raw, "hex");
  const v = bytes[64];
  if (v !== 27 && v !== 28) return false;
  const sInt = BigInt(`0x${bytes.subarray(32, 64).toString("hex")}`);
  if (sInt === 0n || sInt > HALF_N) return false;
  const digest = ethereumDigest(new Uint8Array(inner));
  try {
    const parsed = secp256k1.Signature.fromBytes(concat([Uint8Array.of(v - 27), new Uint8Array(bytes.subarray(0, 64))]), "recovered");
    const pub = parsed.recoverPublicKey(digest).toBytes(false);
    const hash = keccak_256(pub.subarray(1));
    const address = `0x${Buffer.from(hash.subarray(12)).toString("hex")}`;
    return address === voucher.signer.toLowerCase();
  } catch {
    return false;
  }
}

export function encodeLockData(amount: bigint, nonce: bigint): string {
  return `0x${Buffer.from(concat([u256(amount), u256(nonce)])).toString("hex")}`;
}

function hexToBig(word: string): bigint {
  if (!/^0x[0-9a-fA-F]{64}$/.test(word)) throw new ZendoError("A Polygon log word is not 32 bytes.", 400, "malformed");
  return BigInt(word);
}

export function parseLockLogs(receipt: unknown, bridge: string, txHash: string): ParsedLock[] {
  if (!receipt || typeof receipt !== "object") throw new ZendoError("Polygon did not return a receipt.");
  const row = receipt as { status?: unknown; logs?: unknown };
  const status = typeof row.status === "string" ? row.status.toLowerCase() : "";
  if (status !== "0x1" && status !== "0x01") throw new ZendoError("That Polygon transaction did not succeed.");
  if (!Array.isArray(row.logs)) throw new ZendoError("That Polygon receipt has no logs.");
  const wanted = parsePolygonAddress(bridge, "Bridge contract");
  const expectedTx = txHash.toLowerCase();
  const locks: ParsedLock[] = [];
  for (const log of row.logs) {
    if (!log || typeof log !== "object") continue;
    const item = log as { address?: unknown; topics?: unknown; data?: unknown; logIndex?: unknown; transactionHash?: unknown };
    if (typeof item.address !== "string" || item.address.toLowerCase() !== wanted) continue;
    if (!Array.isArray(item.topics) || item.topics.length < 3) continue;
    if (String(item.topics[0]).toLowerCase() !== LOCKED_TOPIC) continue;
    if (typeof item.transactionHash === "string" && item.transactionHash.toLowerCase() !== expectedTx) continue;
    const zendoHash = String(item.topics[2]).toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(zendoHash)) continue;
    if (typeof item.data !== "string" || !/^0x[0-9a-fA-F]{128}$/.test(item.data)) {
      throw new ZendoError("A bridge lock log is missing its amount.", 400, "malformed");
    }
    const indexRaw = typeof item.logIndex === "string" ? item.logIndex : typeof item.logIndex === "number" ? item.logIndex : "";
    const logIndex = typeof indexRaw === "number" ? indexRaw : Number.parseInt(String(indexRaw), 16);
    if (!Number.isInteger(logIndex) || logIndex < 0) throw new ZendoError("A bridge lock log has no index.", 400, "malformed");
    locks.push({
      txHash: expectedTx,
      logIndex,
      zendoHash,
      amount: hexToBig(`0x${item.data.slice(2, 66)}`),
      nonce: hexToBig(`0x${item.data.slice(66, 130)}`),
    });
  }
  return locks;
}

function hexQuantity(value: string): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) throw new ZendoError("A Polygon quantity is not hex.", 400, "malformed");
  return BigInt(value);
}

export function parseObservedLogs(logs: unknown, bridge: string): ObservedLock[] {
  if (!Array.isArray(logs)) throw new ZendoError("Polygon did not return logs.");
  const wanted = parsePolygonAddress(bridge, "Bridge contract");
  const locks: ObservedLock[] = [];
  for (const log of logs) {
    if (!log || typeof log !== "object") continue;
    const item = log as { address?: unknown; topics?: unknown; data?: unknown; logIndex?: unknown; transactionHash?: unknown; blockNumber?: unknown };
    if (typeof item.address !== "string" || item.address.toLowerCase() !== wanted) continue;
    if (!Array.isArray(item.topics) || item.topics.length < 3) continue;
    if (String(item.topics[0]).toLowerCase() !== LOCKED_TOPIC) continue;
    if (typeof item.transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(item.transactionHash)) continue;
    const zendoHash = String(item.topics[2]).toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(zendoHash)) continue;
    if (typeof item.data !== "string" || !/^0x[0-9a-fA-F]{128}$/.test(item.data)) {
      throw new ZendoError("A bridge lock log is missing its amount.", 400, "malformed");
    }
    if (typeof item.blockNumber !== "string") throw new ZendoError("A bridge lock log has no block.", 400, "malformed");
    const indexRaw = typeof item.logIndex === "string" ? item.logIndex : typeof item.logIndex === "number" ? item.logIndex : "";
    const logIndex = typeof indexRaw === "number" ? indexRaw : Number.parseInt(String(indexRaw), 16);
    if (!Number.isInteger(logIndex) || logIndex < 0) throw new ZendoError("A bridge lock log has no index.", 400, "malformed");
    locks.push({
      txHash: item.transactionHash.toLowerCase(),
      logIndex,
      zendoHash,
      amount: hexToBig(`0x${item.data.slice(2, 66)}`),
      nonce: hexToBig(`0x${item.data.slice(66, 130)}`),
      blockNumber: hexQuantity(item.blockNumber),
    });
  }
  return locks;
}
