import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.ZENDO_DISABLE_TIMER = "1";
process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-nc-"));

const PHRASE = "abandon ability able about above absent absorb abstract absurd abuse access accident";

test("a client-signed signup stores the public key and no phrase material", async () => {
  const engine = await import("../lib/engine.ts");
  const { readStateAsync } = await import("../lib/state.ts");
  const { identityFromPhrase, signProof, toHex } = await import("../lib/l1/browser.ts");
  await engine.testingReset();

  const wallet = identityFromPhrase("client@example.com", PHRASE);
  const started = await engine.beginSignupClient({ email: "client@example.com", password: "Harbor-Lamp-42", displayName: "Client" });
  assert.ok(started.pendingId);
  assert.ok(started.challenge);
  let state = await readStateAsync();
  assert.ok(state);
  assert.equal(state.users.some((row) => row.email === "client@example.com"), false, "signup must remain pending until onboarding is complete");

  const committed = await engine.commitSignup(started.pendingId, {
    publicKey: toHex(wallet.publicKey),
    signature: signProof(wallet, "zendo-signup", started.challenge),
  });
  assert.equal(committed.l1Address, wallet.address);
  state = await readStateAsync();
  assert.ok(state);
  assert.equal(state.users.some((row) => row.email === "client@example.com"), false, "phrase proof alone must not create the account");

  const created = await engine.choosePin(started.pendingId, "2580");
  assert.equal(created.l1Address, wallet.address);

  state = await readStateAsync();
  assert.ok(state);
  const user = state.users.find((row) => row.email === "client@example.com");
  assert.ok(user);
  assert.equal(user.publicKey, toHex(wallet.publicKey));
  assert.equal(user.l1Address, wallet.address);
  assert.equal(user.seedHash, "");

  const serialized = JSON.stringify(state);
  assert.ok(!serialized.includes(PHRASE), "the raw phrase leaked into state");
  assert.equal(state.pending.some((row) => row.email === "client@example.com"), false, "signup pending row was not cleared");
});

test("a signup proof must be signed by the key it claims", async () => {
  const engine = await import("../lib/engine.ts");
  const { identityFromPhrase, signProof, toHex } = await import("../lib/l1/browser.ts");
  await engine.testingReset();

  const real = identityFromPhrase("real@example.com", PHRASE);
  const other = identityFromPhrase("other@example.com", "zoo zone zero youth young year yellow yes yet yard yarn yelp");
  const started = await engine.beginSignupClient({ email: "real@example.com", password: "Harbor-Lamp-42", displayName: "Real" });

  await assert.rejects(
    () =>
      engine.commitSignup(started.pendingId, {
        publicKey: toHex(real.publicKey),
        signature: signProof(other, "zendo-signup", started.challenge),
      }),
    /proof did not verify/,
  );

  await assert.rejects(
    () =>
      engine.commitSignup(started.pendingId, {
        publicKey: toHex(real.publicKey),
        signature: signProof(real, "zendo-recover", started.challenge),
      }),
    /proof did not verify/,
    "a recovery-domain signature must not be accepted as a signup proof",
  );
});

test("recovery replaces the password only when the on-device key signs", async () => {
  const engine = await import("../lib/engine.ts");
  const { identityFromPhrase, signProof, toHex } = await import("../lib/l1/browser.ts");
  await engine.testingReset();

  const wallet = identityFromPhrase("recover@example.com", PHRASE);
  const started = await engine.beginSignupClient({ email: "recover@example.com", password: "Harbor-Lamp-42", displayName: "Recover" });
  await engine.commitSignup(started.pendingId, {
    publicKey: toHex(wallet.publicKey),
    signature: signProof(wallet, "zendo-signup", started.challenge),
  });
  const created = await engine.choosePin(started.pendingId, "2580");

  const wrong = await engine.beginRecover("recover@example.com");
  const impostor = identityFromPhrase("impostor@example.com", "zoo zone zero youth young year yellow yes yet yard yarn yelp");
  await assert.rejects(
    () => engine.finishRecover(wrong.pendingId, { signature: signProof(impostor, "zendo-recover", wrong.challenge), password: "Intruder-99", pin: "1111" }),
    /did not verify|Invalid signature/,
    "a wrong key must not reset the account",
  );

  const again = await engine.beginRecover("recover@example.com");
  const result = await engine.finishRecover(again.pendingId, {
    signature: signProof(wallet, "zendo-recover", again.challenge),
    password: "Intruder-99",
    pin: "1111",
  });
  assert.equal(result.user.l1Address, created.l1Address);
  assert.equal(result.sessionVersion, 2);
});

test("production refuses the legacy server-phrase signup and recovery", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();

  const prior = { node: process.env.NODE_ENV, custodial: process.env.ZENDO_L1_ALLOW_CUSTODIAL };
  process.env.NODE_ENV = "production";
  delete process.env.ZENDO_L1_ALLOW_CUSTODIAL;
  try {
    await assert.rejects(
      () => engine.beginSignup({ email: "legacy@example.com", password: "Harbor-Lamp-42", displayName: "Legacy" }),
      /never generates or receives one/,
    );
    await assert.rejects(() => engine.recover({ email: "legacy@example.com", phrase: PHRASE, password: "Harbor-Lamp-42", pin: "2580" }), /never receives a recovery phrase/);
  } finally {
    process.env.NODE_ENV = prior.node;
    if (prior.custodial === undefined) delete process.env.ZENDO_L1_ALLOW_CUSTODIAL;
    else process.env.ZENDO_L1_ALLOW_CUSTODIAL = prior.custodial;
  }
});
