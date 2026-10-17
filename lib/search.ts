import type { State } from "./state";
import type { SearchHit, SearchKind } from "./types";

export const SEARCH_KINDS: SearchKind[] = ["user", "coin", "block", "transaction", "address", "proposal"];

export function exactHref(state: State, query: string): string | null {
  const q = query.trim();
  if (/^\d+$/.test(q)) {
    const height = Number(q);
    return state.blocks.some((item) => item.height === height) ? `/explorer/block/${height}` : null;
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
    const hash = q.toLowerCase();
    if (state.txs.some((item) => item.hash === hash)) return `/explorer/tx/${hash}`;
    const byBlock = state.blocks.find((item) => item.hash === hash);
    return byBlock ? `/explorer/block/${byBlock.height}` : null;
  }
  if (/^znd1[0-9a-f]{38}$/.test(q)) {
    if (state.accounts[q]) return `/explorer/address/${q}`;
    const coin = state.coins.find((item) => item.mint === q && !item.hidden);
    return coin ? `/launchpad/${coin.mint}` : null;
  }
  const coin = state.coins.find((item) => !item.hidden && (item.symbol === q.toUpperCase() || item.name.toLowerCase() === q.toLowerCase()));
  return coin ? `/launchpad/${coin.mint}` : null;
}

export function collectHits(state: State, query: string, kind: string, limit: number): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const want = SEARCH_KINDS.includes(kind as SearchKind) ? (kind as SearchKind) : "all";
  const cap = Math.min(24, Math.max(1, Math.floor(limit) || 8));
  const per = want === "all" ? Math.min(4, cap) : cap;
  const buckets: Record<SearchKind, SearchHit[]> = {
    user: [],
    coin: [],
    block: [],
    transaction: [],
    address: [],
    proposal: [],
  };
  const needle = q.toLowerCase();
  const has = (value: string) => value.toLowerCase().includes(needle);
  const room = (key: SearchKind) => (want === "all" || want === key) && buckets[key].length < per;

  if (want === "all" || want === "user") {
    for (const user of state.users) {
      if (!room("user")) break;
      if (user.banned) continue;
      if (!has(user.displayName) && user.referralCode.toLowerCase() !== needle) continue;
      buckets.user.push({
        kind: "user",
        title: user.displayName,
        detail: user.role === "admin" ? "Operator" : "Account",
        href: `/people/${user.id}`,
      });
    }
  }

  if (want === "all" || want === "coin") {
    for (const coin of state.coins) {
      if (!room("coin")) break;
      if (coin.hidden) continue;
      if (!has(coin.name) && !has(coin.symbol) && !has(coin.mint)) continue;
      buckets.coin.push({
        kind: "coin",
        title: `${coin.symbol} · ${coin.name}`,
        detail: coin.graduated ? "Pool" : "Curve",
        href: `/launchpad/${coin.mint}`,
      });
    }
  }

  if (want === "all" || want === "block") {
    const blocks = [...state.blocks].reverse();
    for (const block of blocks) {
      if (!room("block")) break;
      const height = String(block.height);
      const heightHit = /^\d+$/.test(q) && height.startsWith(q);
      const nameHit = q.length >= 2 && has(block.proposerName);
      const hashHit = q.length >= 4 && has(block.hash);
      if (!heightHit && !nameHit && !hashHit) continue;
      buckets.block.push({
        kind: "block",
        title: `Block ${block.height}`,
        detail: block.proposerName,
        href: `/explorer/block/${block.height}`,
      });
    }
  }

  if (want === "all" || want === "transaction") {
    const txs = [...state.txs].reverse();
    for (const tx of txs) {
      if (!room("transaction")) break;
      const summaryHit = q.length >= 2 && has(tx.summary);
      const hashHit = q.length >= 4 && tx.hash.startsWith(needle);
      const typeHit = q.length >= 3 && has(tx.type);
      if (!summaryHit && !hashHit && !typeHit) continue;
      buckets.transaction.push({
        kind: "transaction",
        title: tx.summary || tx.type,
        detail: tx.hash.slice(0, 14),
        href: `/explorer/tx/${tx.hash}`,
      });
    }
  }

  if (want === "all" || want === "address") {
    for (const validator of state.validators) {
      if (!room("address")) break;
      const nameHit = q.length >= 2 && has(validator.moniker);
      const addrHit = q.length >= 4 && has(validator.address);
      if (!nameHit && !addrHit) continue;
      buckets.address.push({
        kind: "address",
        title: validator.moniker,
        detail: "Validator",
        href: `/explorer/validators/${validator.id}`,
      });
    }
    for (const account of Object.values(state.accounts)) {
      if (!room("address")) break;
      const nameHit = q.length >= 2 && has(account.label);
      const addrHit = q.length >= 4 && has(account.address);
      if (!nameHit && !addrHit) continue;
      buckets.address.push({
        kind: "address",
        title: account.label || account.address,
        detail: account.address,
        href: `/explorer/address/${account.address}`,
      });
    }
  }

  if (want === "all" || want === "proposal") {
    for (const proposal of state.proposals) {
      if (!room("proposal")) break;
      if (!has(proposal.title) && !has(proposal.id) && !has(proposal.authorName)) continue;
      buckets.proposal.push({
        kind: "proposal",
        title: proposal.title,
        detail: proposal.status,
        href: `/governance/${proposal.id}`,
      });
    }
  }

  if (want !== "all") return buckets[want];
  const merged: SearchHit[] = [];
  const depth = Math.max(0, ...SEARCH_KINDS.map((key) => buckets[key].length));
  for (let index = 0; index < depth && merged.length < cap; index += 1) {
    for (const key of SEARCH_KINDS) {
      const hit = buckets[key][index];
      if (hit && merged.length < cap) merged.push(hit);
    }
  }
  return merged;
}
