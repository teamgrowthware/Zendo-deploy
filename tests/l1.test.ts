import assert from "node:assert/strict";
import { createPublicKey, verify as edVerify } from "node:crypto";
import test from "node:test";
import {
  identityForUser,
  identityFromSeed,
  signTx,
  stakePayload,
  toAddressBytes,
  txId,
  txMessage,
} from "../lib/l1/index.ts";

const SEED = Buffer.from("07".repeat(32), "hex");
const PUBKEY = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
const ADDRESS = "fe812c12f3ab4ce6ac5db69ac352f906cb1b11ef";
const MESSAGE = "a55a747611a7ac20c91d7147b4616c225d2ed2388314d88d3bd7ece872734ef8";

function publicKeyObject(raw: Buffer) {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]);
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

test("the TypeScript L1 signer matches the Rust node byte for byte", () => {
  const identity = identityFromSeed("vector-user", SEED);
  assert.equal(identity.publicKey.toString("hex"), PUBKEY);
  assert.equal(identity.address, ADDRESS);
  const to = Buffer.from("11".repeat(20), "hex");
  assert.equal(txMessage(identity.publicKey, 3, to, 250, 2).toString("hex"), MESSAGE);
});

test("a signed transfer verifies and carries the node's wire shape", () => {
  const identity = identityFromSeed("vector-user", SEED);
  const tx = signTx(identity, { nonce: 3, to: "11".repeat(20), amount: 250, fee: 2 });
  assert.deepEqual(Object.keys(tx).sort(), ["amount", "data", "fee", "from", "nonce", "signature", "to"]);
  assert.equal(tx.from, PUBKEY);
  assert.equal(tx.to, "11".repeat(20));
  assert.equal(tx.data, "");
  assert.equal(tx.signature.length, 128);
  assert.equal(txId(tx), MESSAGE);
  const message = txMessage(identity.publicKey, 3, toAddressBytes(tx.to), 250, 2);
  assert.equal(edVerify(null, message, publicKeyObject(identity.publicKey), Buffer.from(tx.signature, "hex")), true);
  const tampered = { ...tx, amount: 251 };
  assert.notEqual(txId(tampered), MESSAGE);
});

test("a staking payload and a data transaction use the V2 domain", () => {
  const identity = identityFromSeed("vector-user", SEED);
  assert.equal(stakePayload(1, 0).toString("hex"), "0100000000");
  assert.equal(stakePayload(2, 7).toString("hex"), "0200000007");
  const to = Buffer.from("11".repeat(20), "hex");
  const plain = txMessage(identity.publicKey, 0, to, 0, 1);
  const staked = txMessage(identity.publicKey, 0, to, 0, 1, stakePayload(1, 0));
  assert.notEqual(plain.toString("hex"), staked.toString("hex"));
  const tx = signTx(identity, { nonce: 0, to: "11".repeat(20), amount: 0, fee: 1, data: stakePayload(1, 0) });
  assert.equal(tx.data, "0100000000");
  assert.equal(txId(tx), staked.toString("hex"));
});

test("per-user signers are deterministic and distinct", () => {
  const master = Buffer.from("2b".repeat(16), "hex");
  const alice = identityForUser(master, "alice");
  const again = identityForUser(master, "alice");
  const bob = identityForUser(master, "bob");
  assert.equal(alice.address, again.address);
  assert.equal(alice.address.length, 40);
  assert.notEqual(alice.address, bob.address);
  assert.throws(() => identityForUser(Buffer.alloc(4), "alice"));
});
