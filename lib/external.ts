import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExternalAssetRecord, State } from "./state";

const CHAINS = new Set(["ethereum", "bsc", "polygon", "avalanche", "solana"]);

export type Observation = {
  source: string;
  assetId: string;
  kind: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  headNumber: number;
  topic: string;
  token: string;
  amount: string;
  zendoAccount: string;
};

export type Judgment =
  | { action: "mint" | "burn"; key: string; account: string; amount: bigint; synthetic: string; assetId: string }
  | { action: "quarantine"; key: string; reason: string };

export function fileRegistry(): ExternalAssetRecord[] {
  const path = join(process.cwd(), "zendo-chain", "config", "external-assets.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { assets: ExternalAssetRecord[] };
  return parsed.assets;
}

export function registryOf(state: State): ExternalAssetRecord[] {
  const base = fileRegistry();
  const extra = state.externalAssets || [];
  const seen = new Set(base.map((asset) => asset.id));
  return base.concat(extra.filter((asset) => !seen.has(asset.id)));
}

export function validateAsset(asset: ExternalAssetRecord) {
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(asset.id)) throw new Error("Asset id must be 3 to 80 safe characters.");
  if (!CHAINS.has(asset.chain)) throw new Error("Unsupported chain type.");
  if (!asset.symbol || asset.symbol.length > 16) throw new Error("Symbol must be 1 to 16 characters.");
  if (asset.decimals > 18) throw new Error("Decimals cannot exceed 18.");
  if (asset.chain !== "solana" && !/^0x[0-9a-fA-F]{40}$/.test(asset.token)) throw new Error("EVM token must be a 0x address.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(asset.topic)) throw new Error("Topic must be 32 bytes of hex.");
  if (asset.confirmations < 1 || asset.confirmations > 10_000) throw new Error("Confirmations must be between 1 and 10000.");
  if (asset.minSources < 2 || asset.minSources > 7) throw new Error("At least two RPC sources are required.");
  for (const rpc of asset.rpcs) {
    if (!(rpc.startsWith("https://") || rpc.startsWith("http://127.0.0.1") || rpc.startsWith("http://localhost"))) {
      throw new Error("RPC URLs must be https, or localhost for a private node.");
    }
  }
}

function hostOf(source: string) {
  return source.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
}

export function judge(state: State, observations: Observation[]): Judgment {
  if (observations.length < 2) throw new Error("Two independent observations are required.");
  const first = observations[0];
  const asset = registryOf(state).find((row) => row.id === first.assetId);
  if (!asset) throw new Error("Unknown external asset.");
  if (!asset.enabled) throw new Error("That asset is disabled.");
  const key = `${asset.chain}:${first.txHash}:${first.logIndex}`;
  if (state.externalSeen.includes(key)) throw new Error("Event already applied. Replay rejected.");
  const hosts = new Set<string>();
  for (const row of observations) {
    if (
      row.assetId !== first.assetId ||
      row.kind !== first.kind ||
      row.txHash !== first.txHash ||
      row.logIndex !== first.logIndex ||
      row.amount !== first.amount ||
      row.zendoAccount !== first.zendoAccount ||
      row.token.toLowerCase() !== first.token.toLowerCase() ||
      row.topic.toLowerCase() !== first.topic.toLowerCase()
    ) {
      return { action: "quarantine", key, reason: "Sources disagree." };
    }
    if (row.headNumber < row.blockNumber || row.headNumber - row.blockNumber + 1 < asset.confirmations) {
      return { action: "quarantine", key, reason: "Not enough confirmations." };
    }
    if (row.topic.toLowerCase() !== asset.topic.toLowerCase() || row.token.toLowerCase() !== asset.token.toLowerCase()) {
      throw new Error("Event does not match the registry.");
    }
    hosts.add(hostOf(row.source));
  }
  if (hosts.size < asset.minSources) throw new Error("Not enough independent RPC sources.");
  if (!/^znd1[0-9a-f]{38}$/.test(first.zendoAccount)) throw new Error("Address is not a Zendo account.");
  if (first.kind !== "deposit" && first.kind !== "withdraw") throw new Error("Kind must be deposit or withdraw.");
  let amount: bigint;
  try {
    amount = BigInt(first.amount);
  } catch {
    throw new Error("Amount is not an integer.");
  }
  if (amount <= 0n) throw new Error("Amount must be positive.");
  return {
    action: first.kind === "deposit" ? "mint" : "burn",
    key,
    account: first.zendoAccount,
    amount,
    synthetic: `syn:${asset.id}`,
    assetId: asset.id,
  };
}

export const FEE_SCHEDULE = {
  launch: "200000000000000000",
  tradeBps: 100,
  boost: "50000000000000000000",
  listing: "1000000000000000000",
  govern: "1000000000000000000",
  stakeBps: 0,
};
