import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { historyToCsv } from "../lib/history.ts";
import { ZENDO_OPERATOR } from "../lib/seed.ts";

process.env.ZENDO_DISABLE_TIMER = "1";
process.env.ZENDO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "zendo-support-"));

test("tickets stay on the node and history exports the wallet", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);

  const opened = await engine.submitTicket(operator.id, {
    subject: "Bridge screen",
    category: "Bridge",
    body: "The voucher did not show a signature.",
  });
  assert.equal(opened.tickets.length, 1);
  assert.equal(opened.tickets[0].status, "open");
  assert.equal(opened.tickets[0].attachmentName, null);

  const answered = await engine.replyTicket(operator.id, opened.tickets[0].id, "The host has no bridge key yet.", "operator");
  assert.equal(answered.tickets[0].status, "progress");
  assert.equal(answered.tickets[0].replies[0].from, "operator");
  assert.equal(answered.tickets[0].notes.length, 0);

  const reopened = await engine.replyTicket(operator.id, opened.tickets[0].id, "I will check the host config.", "user");
  assert.equal(reopened.tickets[0].status, "open");
  assert.equal(reopened.tickets.length, 1);

  const kept = await engine.submitTicket(operator.id, {
    subject: "With a file",
    category: "Other",
    body: "The path prefix must be dropped.",
    attachmentName: "../note.png",
    attachmentType: "image/png",
    attachmentData: "aaaa",
  });
  assert.equal(kept.tickets[0].attachmentName, "note.png");
  await assert.rejects(() =>
    engine.submitTicket(operator.id, {
      subject: "Bad file",
      category: "Other",
      body: "This attachment should be refused.",
      attachmentName: "note.html",
      attachmentType: "text/html",
      attachmentData: "aaaa",
    }),
  );

  const history = await engine.historyFor(operator.id);
  assert.equal(history.displayName, "Zendo Operator");
  assert.ok(history.address.startsWith("znd1"));
  assert.ok(Array.isArray(history.transactions));
  assert.ok(Array.isArray(history.staking.stakes));
  assert.ok(Array.isArray(history.governance));
  assert.ok(Array.isArray(history.memeCoins.created));
  const csv = historyToCsv(history);
  assert.match(csv, /^section,id,at,detail,amount,extra/);
  const pass = await engine.issueHistoryPass(operator.id, "csv");
  assert.match(pass.url, /\/zendo-history\/[a-f0-9]{32}\/zendo-history\.csv$/);
});

test("the operator desk pauses accounts and keeps ticket notes private", async () => {
  const engine = await import("../lib/engine.ts");
  await engine.testingReset();
  const operator = await engine.userByEmail(ZENDO_OPERATOR.email);
  assert.ok(operator);
  const started = await engine.beginSignup({
    email: "desk-user@example.com",
    password: "Harbor-Lamp-42",
    displayName: "Desk User",
  });
  await engine.answerSeed(started.pendingId, started.quiz.map((index: number) => started.words[index]));
  const created = await engine.choosePin(started.pendingId, "2580");
  const opened = await engine.submitTicket(created.id, {
    subject: "Need a look",
    category: "Wallet",
    body: "The balance page is slow today.",
  });
  const noted = await engine.addTicketNote(operator.id, opened.tickets[0].id, "Checked the host disk.");
  const ticket = noted.tickets.find((row) => row.id === opened.tickets[0].id);
  assert.ok(ticket);
  assert.equal(ticket.notes[0].body, "Checked the host disk.");
  const mine = await engine.listTickets(created.id);
  assert.equal(mine.tickets[0].notes.length, 0);
  const closed = await engine.setTicketStatus(operator.id, opened.tickets[0].id, "closed");
  assert.equal(closed.tickets.find((row) => row.id === opened.tickets[0].id)?.status, "closed");
  await assert.rejects(() => engine.replyTicket(created.id, opened.tickets[0].id, "Still waiting here.", "user"));
  const role = await engine.adminUserRole(operator.id, created.id, "creator");
  assert.equal(role.people.find((person) => person.id === created.id)?.role, "creator");
  assert.ok(role.parameters.some((item) => item.key === "block_time_ms"));
  assert.ok(role.health.stateBytes >= 0);
  await engine.adminUserBan(operator.id, created.id, true);
  await assert.rejects(() => engine.wallet(created.id), /paused/);
  await assert.rejects(() => engine.adminUserBan(operator.id, operator.id, true), /own account/);
});
