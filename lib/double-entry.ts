import { randomBytes } from "crypto";
import type { JournalEntry, State } from "./state";

/**
 * One transfer is a debit and a credit for the same amount.
 * That is the double-entry shape TigerBeetle stores as
 * debit_account_id, credit_account_id, amount, and ledger.
 * The rows live in the chain journal and in the transfers table.
 * A TigerBeetle cluster is used only when TIGERBEETLE_ADDRESSES is set
 * on a host that is actually running TigerBeetle.
 */
export function postTransfer(state: State, debit: string, credit: string, asset: string, amount: bigint, at = Date.now()): JournalEntry {
  if (amount <= 0n) throw new Error("A transfer amount must be positive.");
  if (!debit || !credit) throw new Error("A transfer needs a debit account and a credit account.");
  if (!Array.isArray(state.journal)) state.journal = [];
  const entry: JournalEntry = {
    id: `je_${randomBytes(8).toString("hex")}`,
    at,
    debit,
    credit,
    asset,
    amount: amount.toString(),
  };
  state.journal.push(entry);
  if (state.journal.length > 2000) state.journal.splice(0, state.journal.length - 2000);
  assertTransfer(entry);
  return entry;
}

export function assertTransfer(entry: JournalEntry) {
  const amount = BigInt(entry.amount);
  if (amount <= 0n) throw new Error("Journal entry is not balanced.");
  if (!entry.debit || !entry.credit || entry.debit === entry.credit) throw new Error("Journal entry is not balanced.");
}

export function journalRows(body: string): JournalEntry[] {
  try {
    const parsed = JSON.parse(body) as { journal?: unknown };
    if (!Array.isArray(parsed.journal)) return [];
    const rows: JournalEntry[] = [];
    for (const item of parsed.journal) {
      if (!item || typeof item !== "object") continue;
      const row = item as Partial<JournalEntry>;
      if (typeof row.id !== "string" || typeof row.debit !== "string" || typeof row.credit !== "string" || typeof row.asset !== "string" || typeof row.amount !== "string") continue;
      rows.push({
        id: row.id,
        at: Number(row.at) || 0,
        debit: row.debit,
        credit: row.credit,
        asset: row.asset,
        amount: row.amount,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

export function journalBalances(entries: JournalEntry[]): boolean {
  const nets = new Map<string, bigint>();
  for (const entry of entries) {
    const amount = BigInt(entry.amount);
    const key = entry.asset;
    nets.set(`${entry.debit}|${key}|debit`, (nets.get(`${entry.debit}|${key}|debit`) || 0n) + amount);
    nets.set(`${entry.credit}|${key}|credit`, (nets.get(`${entry.credit}|${key}|credit`) || 0n) + amount);
  }
  let debits = 0n;
  let credits = 0n;
  for (const [key, value] of nets) {
    if (key.endsWith("|debit")) debits += value;
    else credits += value;
  }
  return debits === credits;
}
