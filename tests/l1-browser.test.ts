import assert from "node:assert/strict";
import test from "node:test";
import {
  addressFromPublic as nodeAddress,
  identityFromPhrase as nodeFromPhrase,
  identityFromSeed as nodeFromSeed,
  txId as nodeTxId,
  signTx as nodeSignTx,
} from "../lib/l1/index.ts";
import {
  addressFromPublic as webAddress,
  identityFromPhrase as webFromPhrase,
  identityFromSeed as webFromSeed,
  fromHex,
  signTx as webSignTx,
  toHex,
  txMessage as webTxMessage,
} from "../lib/l1/browser.ts";

const SEED = Buffer.from("07".repeat(32), "hex");

test("the browser signer derives the same key and address as the node signer", () => {
  const node = nodeFromSeed("vector-user", SEED);
  const web = webFromSeed("vector-user", new Uint8Array(SEED));
  assert.equal(web.publicKey.length, 32);
  assert.equal(toHex(web.publicKey), node.publicKey.toString("hex"));
  assert.equal(web.address, node.address);
  assert.equal(web.address, "fe812c12f3ab4ce6ac5db69ac352f906cb1b11ef");
  assert.equal(webAddress(new Uint8Array(web.publicKey)), nodeAddress(node.publicKey));
});

test("a phrase maps to the same identity in both implementations", () => {
  const phrase = "zendo operator approval phrase for the local test node";
  const node = nodeFromPhrase("phrase-user", phrase);
  const web = webFromPhrase("phrase-user", phrase);
  assert.equal(web.address, node.address);
  assert.equal(toHex(web.publicKey), node.publicKey.toString("hex"));
});

test("browser-signed transactions match the pinned node vector", () => {
  const web = webFromSeed("vector-user", new Uint8Array(SEED));
  const node = nodeFromSeed("vector-user", SEED);
  const input = { nonce: 3, to: "11".repeat(20), amount: 250, fee: 2 };
  const webTx = webSignTx(web, input);
  const nodeTx = nodeSignTx(node, input);
  assert.equal(webTx.from, nodeTx.from);
  assert.equal(webTx.signature, nodeTx.signature);
  const message = webTxMessage(web.publicKey, 3, fromHex("11".repeat(20)), 250, 2);
  assert.equal(toHex(message), "a55a747611a7ac20c91d7147b4616c225d2ed2388314d88d3bd7ece872734ef8");
  assert.equal(toHex(message), nodeTxId(nodeTx));
});

test("a browser-signed transaction verifies under the server checker", async () => {
  const { verifyL1Tx } = await import("../lib/l1/index.ts");
  const web = webFromSeed("vector-user", new Uint8Array(SEED));
  const tx = webSignTx(web, { nonce: 1, to: "22".repeat(20), amount: 5_000_000_000_000_000_000n, fee: 10_000n });
  const verified = verifyL1Tx(tx);
  assert.equal(verified.amount, "5000000000000000000");
});
