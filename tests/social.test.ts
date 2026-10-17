import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ZENDO_OPERATOR } from "../lib/seed.ts";

process.env.ZENDO_DISABLE_TIMER = "1";
process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-social-"));

async function account(engine: typeof import("../lib/engine.ts"), email: string, displayName: string) {
  const started = await engine.beginSignup({ email, password: "Harbor-Lamp-42", displayName });
  await engine.answerSeed(started.pendingId, started.quiz.map((index: number) => started.words[index]));
  return engine.choosePin(started.pendingId, "2580");
}

test("suggestions cover accounts, coins, and chain rows", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  await engine.createCoin(operator.id, {
    name: "Pond Frog",
    symbol: "FROG",
    description: "A coin created in the search test.",
    emoji: "🐸",
    hue: 88,
  });
  const frog = await engine.suggest("frog", "coin", 8);
  assert.ok(frog.hits.some((hit) => hit.kind === "coin" && hit.href.startsWith("/launchpad/")));
  assert.equal(frog.hits.some((hit) => hit.kind !== "coin"), false);

  const people = await engine.suggest("operator", "user", 8);
  assert.ok(people.hits.some((hit) => hit.title === "Zendo Operator" && hit.href === "/people/usr_operator"));

  const proposals = await engine.suggest("launchpad trade fee", "proposal", 8);
  assert.ok(proposals.hits.some((hit) => hit.href === "/governance/prop_fee"));

  const blocks = await engine.suggest("1", "block", 8);
  assert.ok(blocks.hits.length > 0);
  assert.ok(blocks.hits.every((hit) => hit.kind === "block" && hit.href.startsWith("/explorer/block/")));

  const addresses = await engine.suggest("treasury", "address", 8);
  assert.ok(addresses.hits.some((hit) => hit.href.startsWith("/explorer/address/znd1")));

  const mixed = await engine.suggest("frog", "all", 12);
  assert.ok(mixed.hits.some((hit) => hit.kind === "coin"));
  const exact = await engine.search("FROG");
  assert.ok(exact?.href.startsWith("/launchpad/"));

  await assert.rejects(() => engine.socialProfile("usr_missing", null), /Account not found/);
  const profile = await engine.socialProfile(operator.id, null);
  assert.equal(profile.person.displayName, "Zendo Operator");
  assert.equal(profile.youFollow, false);
});

test("follows, posts, circles, and messages stay on the ledger", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const ada = await account(engine, "ada-social@example.com", "Ada Social");
  const ben = await account(engine, "ben-social@example.com", "Ben Social");

  await assert.rejects(() => engine.followAccount(ada.id, ada.id), /own account/);
  const followed = await engine.followAccount(ada.id, ben.id);
  assert.equal(followed.youFollow, true);
  assert.equal(followed.followers, 1);
  const back = await engine.followAccount(ben.id, ada.id);
  assert.equal(back.mutual, true);
  const adaProfile = await engine.socialProfile(ada.id, ben.id);
  assert.equal(adaProfile.mutuals.some((item) => item.id === ben.id), true);

  await engine.publishPost(ada.id, "First post on the timeline.");
  await engine.publishStory(ada.id, "Story line");
  await engine.publishVideo(ada.id, "Clip title", "Caption only, no file.");
  const feed = await engine.createCircle(ada.id, "Night desk", [ben.id]);
  assert.ok(feed.circles.some((circle) => circle.name === "Night desk" && circle.members.some((member) => member.id === ben.id)));
  assert.equal(feed.posts[0].body, "First post on the timeline.");
  assert.equal(feed.stories[0].caption, "Story line");

  const inbox = await engine.sendDirect(ada.id, ben.id, "Ping from Ada");
  assert.equal(inbox.threads[0].with.id, ben.id);
  const benInbox = await engine.socialInbox(ben.id);
  assert.equal(benInbox.threads[0].lastBody, "Ping from Ada");
  await assert.rejects(() => engine.sendDirect(ada.id, ada.id, "Hello me"));

  const stats = await engine.socialAnalytics(ben.id);
  assert.equal(stats.followers, 1);
  assert.equal(stats.following, 1);

  const hidden = await engine.suggest("Ada", "user", 8);
  assert.ok(hidden.hits.some((hit) => hit.title === "Ada Social"));
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  await engine.adminUserBan(operator.id, ada.id, true);
  const after = await engine.suggest("Ada", "user", 8);
  assert.equal(after.hits.some((hit) => hit.title === "Ada Social"), false);
  await assert.rejects(() => engine.socialProfile(ada.id, ben.id), /Account not found/);
});
