import { addressFromPublic } from "./crypto";
import { ZERO_ADDRESS } from "./operations";
import { STAKE_ADDRESS } from "./tx";

/**
 * Chain -> read-model reconciliation for zendo-1.
 *
 * The read model is a projection. It is written only from confirmed L1 state; a failure here never
 * touches the L1 node because the flow is one-directional (read the chain, write the projection). The
 * reconciler folds confirmed L1 *transfers* into the read model as balance deltas, keyed by height and
 * guarded by transaction id, so a replay, a restart, or a forced rebuild is idempotent and
 * duplicate-proof. It layers L1 movement on top of the app's own genesis allocation; it does not
 * replace that allocation, because the app ledger and the L1 ledger have different genesis.
 */

/** A transaction as it appears inside a finalized zendo-1 block. */
export type ChainTx = {
  /** The transaction id (hex of the canonical signed message) used as the idempotency guard. */
  id: string;
  /** Sender public key, 32 bytes of hex. */
  from: string;
  /** Recipient L1 address, 20 bytes of hex. */
  to: string;
  /** Base units as a decimal string. */
  amount: string;
  /** Base units as a decimal string. */
  fee: string;
  /** Hex calldata; a plain transfer has none. */
  data?: string;
};

export type ChainBlock = { height: number; txs: ChainTx[] };

/** The minimal chain surface the reconciler needs. `L1Client` satisfies it. */
export interface ChainSource {
  finalized(): Promise<number>;
  block(height: number): Promise<ChainBlock>;
  balance(address: string): Promise<string>;
}

/** The minimal read-model surface the reconciler mutates. `State` satisfies it structurally. */
export type ReadModel = {
  accounts: Record<string, { balances: Record<string, string> }>;
  users: { address: string; l1Address?: string }[];
  reconcileHeight?: number;
  reconcileApplied?: string[];
  reconcileFees?: string;
  reconcileAt?: number;
  reconcileReport?: unknown;
};

export type Divergence = { address: string; l1: string; chain: string; readModel: string };

export type ReconcileReport = {
  /** The first height scanned in this pass. */
  from: number;
  /** The highest finalized height seen on the chain. */
  chainHeight: number;
  /** The height the read model advanced to. Equals `from - 1` when nothing new was available. */
  to: number;
  scanned: number;
  applied: number;
  /** Transactions skipped because their id was already applied. */
  duplicate: number;
  /** Transactions skipped because a party is not in the read model. */
  unmapped: number;
  /** Contract calls, stake ops and other non-transfer activity, tracked but not applied. */
  ignored: number;
  diverged: Divergence[];
  errors: string[];
  fees: string;
  at: number;
};

export type Collected = { blocks: ChainBlock[]; errors: string[]; chainHeight: number };

const HEX = /^[0-9a-fA-F]+$/;

/** A plain value transfer: no calldata and neither the stake address nor the deploy address. */
export function isPlainTransfer(tx: ChainTx): boolean {
  if (tx.data && tx.data.length > 0) return false;
  const to = tx.to.toLowerCase();
  return to !== STAKE_ADDRESS.toLowerCase() && to !== ZERO_ADDRESS.toLowerCase();
}

/**
 * Resolves an L1 address to the read-model account that owns it. System and legacy accounts are keyed
 * by their own address; client-signing users carry an explicit `l1Address` that decouples the two.
 */
export function resolveModelAddress(model: ReadModel, l1Address: string): string | null {
  const wanted = l1Address.toLowerCase();
  for (const address of Object.keys(model.accounts)) {
    if (address.toLowerCase() === wanted) return address;
  }
  for (const user of model.users) {
    if (user.l1Address && user.l1Address.toLowerCase() === wanted) return user.address;
  }
  return null;
}

function add(model: ReadModel, address: string, token: string, amount: bigint): void {
  if (amount === 0n) return;
  const account = model.accounts[address];
  account.balances[token] = (BigInt(account.balances[token] || "0") + amount).toString();
}

function sub(model: ReadModel, address: string, token: string, amount: bigint): void {
  if (amount === 0n) return;
  const account = model.accounts[address];
  const current = BigInt(account.balances[token] || "0");
  const next = current < amount ? 0n : current - amount;
  if (next === 0n) delete account.balances[token];
  else account.balances[token] = next.toString();
}

/** Fetches confirmed blocks from `from` to the chain's finalized head. Stops at the first failure. */
export async function collectConfirmed(source: ChainSource, from: number): Promise<Collected> {
  const chainHeight = await source.finalized();
  const blocks: ChainBlock[] = [];
  const errors: string[] = [];
  for (let height = from; height <= chainHeight; height += 1) {
    try {
      blocks.push(await source.block(height));
    } catch (error) {
      errors.push(`block ${height}: ${error instanceof Error ? error.message : "unavailable"}`);
      break;
    }
  }
  return { blocks, errors, chainHeight };
}

export type ApplyOptions = {
  /** Where observed transfer fees are credited so the projection stays supply-conserving. */
  feeSink?: string;
  now?: number;
};

/**
 * Folds already-fetched confirmed transfers into the read model in place. Synchronous so the caller can
 * run it inside one ordered commit. Never throws for chain or mapping problems: it records the reason
 * and leaves the height at the last fully-applied block so the next pass resumes safely.
 */
export function applyReconcile(
  model: ReadModel,
  collected: Collected,
  from: number,
  options: ApplyOptions = {},
): ReconcileReport {
  const report: ReconcileReport = {
    from,
    chainHeight: collected.chainHeight,
    to: from - 1,
    scanned: 0,
    applied: 0,
    duplicate: 0,
    unmapped: 0,
    ignored: 0,
    diverged: [],
    errors: [...collected.errors],
    fees: "0",
    at: options.now ?? Date.now(),
  };
  const applied = new Set(model.reconcileApplied ?? []);
  let fees = 0n;

  for (const block of collected.blocks) {
    for (const tx of block.txs) {
      report.scanned += 1;
      if (applied.has(tx.id)) {
        report.duplicate += 1;
        continue;
      }
      if (!isPlainTransfer(tx)) {
        report.ignored += 1;
        continue;
      }
      const sender = resolveModelAddress(model, addressFromPublic(Buffer.from(tx.from, "hex")));
      const recipient = resolveModelAddress(model, tx.to);
      if (!sender || !recipient) {
        report.unmapped += 1;
        continue;
      }
      const amount = BigInt(tx.amount);
      const fee = BigInt(tx.fee || "0");
      sub(model, sender, "ZCOIN", amount + fee);
      add(model, recipient, "ZCOIN", amount);
      if (fee > 0n) {
        fees += fee;
        if (options.feeSink && model.accounts[options.feeSink]) add(model, options.feeSink, "ZCOIN", fee);
      }
      applied.add(tx.id);
      report.applied += 1;
    }
    report.to = block.height;
    model.reconcileHeight = block.height;
  }

  const appliedList = [...applied];
  model.reconcileApplied = appliedList.length > 20_000 ? appliedList.slice(-20_000) : appliedList;
  model.reconcileFees = (BigInt(model.reconcileFees || "0") + fees).toString();
  report.fees = fees.toString();
  return report;
}

/** Standalone (fetch + apply) reconciliation, used by tests and one-shot tooling. */
export async function reconcile(
  model: ReadModel,
  source: ChainSource,
  options: ApplyOptions & { checkDivergence?: boolean } = {},
): Promise<ReconcileReport> {
  const from = (model.reconcileHeight ?? 0) + 1;
  const collected = await collectConfirmed(source, from);
  const report = applyReconcile(model, collected, from, options);
  if (options.checkDivergence) {
    for (const address of touchedAccounts(model, collected, from)) {
      const l1 = l1AddressOf(model, address);
      if (!l1) continue;
      const chain = await source.balance(l1);
      const readModel = model.accounts[address].balances.ZCOIN || "0";
      if (BigInt(chain) !== BigInt(readModel)) report.diverged.push({ address, l1, chain, readModel });
    }
  }
  return report;
}

function touchedAccounts(model: ReadModel, collected: Collected, from: number): Set<string> {
  const touched = new Set<string>();
  void from;
  for (const block of collected.blocks) {
    for (const tx of block.txs) {
      if (!isPlainTransfer(tx)) continue;
      const sender = resolveModelAddress(model, addressFromPublic(Buffer.from(tx.from, "hex")));
      const recipient = resolveModelAddress(model, tx.to);
      if (sender) touched.add(sender);
      if (recipient) touched.add(recipient);
    }
  }
  return touched;
}

function l1AddressOf(model: ReadModel, address: string): string | null {
  for (const user of model.users) {
    if (user.address === address && user.l1Address) return user.l1Address;
  }
  if (HEX.test(address) && address.length === 40) return address;
  return null;
}

/** Clears the guard set and height so the next pass replays every confirmed L1 transfer. */
export function resetForRebuild(model: ReadModel): void {
  model.reconcileHeight = 0;
  model.reconcileApplied = [];
  model.reconcileFees = "0";
  model.reconcileReport = null;
}

export function emptyReport(from: number, chainHeight: number, at = Date.now()): ReconcileReport {
  return {
    from,
    chainHeight,
    to: from - 1,
    scanned: 0,
    applied: 0,
    duplicate: 0,
    unmapped: 0,
    ignored: 0,
    diverged: [],
    errors: [],
    fees: "0",
    at,
  };
}
