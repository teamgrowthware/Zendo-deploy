import { L1Identity, sha256 } from "./crypto";

export type L1Tx = {
  from: string;
  nonce: number;
  to: string;
  amount: string;
  fee: string;
  signature: string;
  data: string;
};

export const STAKE_ADDRESS = "0000000000000000000000000000000000000001";

const TRANSFER_DOMAIN = Buffer.from("ZENDO_TX_V1");
const DATA_DOMAIN = Buffer.from("ZENDO_TX_V2");

function encodeU64(value: bigint | string | number): Buffer {
  const bi = typeof value === "bigint" ? value : BigInt(value);
  if (bi < 0n) throw new Error("an L1 nonce must be a whole number");
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(bi & 0xffffffffffffffffn);
  return out;
}

function encodeU128(value: bigint | string | number): Buffer {
  const bi = typeof value === "bigint" ? value : BigInt(value);
  if (bi < 0n) throw new Error("an L1 amount must be a whole number");
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) { out[i] = Number((bi >> BigInt(i * 8)) & 0xffn); }
  return out;
}

export function toAddressBytes(address: string): Buffer {
  const raw = Buffer.from(address.replace(/^0x/, ""), "hex");
  if (raw.length !== 20) throw new Error("an L1 address must be 20 bytes");
  return raw;
}

export function txMessage(from: Buffer, nonce: number, to: Buffer, amount: bigint | string | number, fee: bigint | string | number, data?: Buffer): Buffer {
  const head = Buffer.concat([from, encodeU64(nonce), to, encodeU128(amount), encodeU128(fee)]);
  const body = data && data.length > 0 ? Buffer.concat([DATA_DOMAIN, head, data]) : Buffer.concat([TRANSFER_DOMAIN, head]);
  return sha256(body);
}

export function signTx(
  identity: L1Identity,
  input: { nonce: number; to: string; amount: bigint | string | number; fee: bigint | string | number; data?: Buffer },
): L1Tx {
  const to = toAddressBytes(input.to);
  const message = txMessage(identity.publicKey, input.nonce, to, input.amount, input.fee, input.data);
  const amt = typeof input.amount === "bigint" ? input.amount : BigInt(input.amount);
  const feeAmt = typeof input.fee === "bigint" ? input.fee : BigInt(input.fee);
  return {
    from: identity.publicKey.toString("hex"),
    nonce: input.nonce,
    to: to.toString("hex"),
    amount: amt.toString(),
    fee: feeAmt.toString(),
    signature: identity.sign(message).toString("hex"),
    data: input.data && input.data.length > 0 ? input.data.toString("hex") : "",
  };
}

export function txId(tx: L1Tx): string {
  const data = tx.data ? Buffer.from(tx.data, "hex") : undefined;
  return txMessage(Buffer.from(tx.from, "hex"), tx.nonce, toAddressBytes(tx.to), tx.amount, tx.fee, data).toString("hex");
}

export function stakePayload(selector: 1 | 2, validatorIndex: number): Buffer {
  if (!Number.isInteger(validatorIndex) || validatorIndex < 0 || validatorIndex > 0xffffffff) {
    throw new Error("a validator index must fit in 32 bits");
  }
  const out = Buffer.alloc(5);
  out.writeUInt8(selector, 0);
  out.writeUInt32BE(validatorIndex, 1);
  return out;
}
