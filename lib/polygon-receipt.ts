import { ZendoError } from "./errors";
import { LOCKED_TOPIC, parseObservedLogs, type ObservedLock } from "./bridge-proof";

export function polygonRpcUrl(): string {
  const raw = (process.env.QUICKNODE_POLYGON_RPC_URL || process.env.POLYGON_RPC_URL || "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ZendoError("Set QUICKNODE_POLYGON_RPC_URL or POLYGON_RPC_URL to an https Polygon endpoint before a deposit can be checked.");
  }
  if (url.username || url.password) throw new ZendoError("POLYGON_RPC_URL must not embed a secret.");
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol === "http:" && loopback && process.env.ZENDO_RPC_ALLOW_LOOPBACK === "1") return url.toString();
  if (url.protocol !== "https:") throw new ZendoError("POLYGON_RPC_URL must use https.");
  return url.toString();
}

export function polygonConfigured(): boolean {
  try {
    polygonRpcUrl();
    return true;
  } catch {
    return false;
  }
}

export async function polygonCall(method: string, params: unknown[]): Promise<unknown> {
  const endpoint = polygonRpcUrl();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    });
  } catch {
    throw new ZendoError("The Polygon endpoint did not answer.", 502);
  }
  if (!response.ok) throw new ZendoError("The Polygon endpoint rejected the request.", 502);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ZendoError("The Polygon endpoint did not return JSON.", 502);
  }
  if (!body || typeof body !== "object" || !("result" in body)) {
    throw new ZendoError("The Polygon endpoint returned an unexpected body.", 502);
  }
  const row = body as { result?: unknown; error?: { message?: string } };
  if (row.error?.message) throw new ZendoError("Polygon could not complete that request.", 502);
  return row.result;
}

export function polygonTxHash(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value.trim())) {
    throw new ZendoError("Enter the Polygon transaction hash, 0x plus 64 hex characters.");
  }
  return value.trim().toLowerCase();
}

export async function fetchPolygonReceipt(txHash: string): Promise<unknown> {
  const result = await polygonCall("eth_getTransactionReceipt", [txHash]);
  if (result == null) throw new ZendoError("That transaction is not on Polygon yet.");
  return result;
}

export type PolygonHead = {
  chainId: number;
  number: bigint;
  hash: string;
  parentHash: string;
};

export async function polygonHead(): Promise<PolygonHead> {
  const chainHex = await polygonCall("eth_chainId", []);
  const block = await polygonCall("eth_getBlockByNumber", ["latest", false]);
  if (typeof chainHex !== "string" || !/^0x[0-9a-fA-F]+$/.test(chainHex)) {
    throw new ZendoError("The Polygon endpoint did not return a chain id.", 502);
  }
  if (!block || typeof block !== "object") throw new ZendoError("The Polygon endpoint did not return a block header.", 502);
  const row = block as { number?: unknown; hash?: unknown; parentHash?: unknown };
  if (typeof row.number !== "string" || typeof row.hash !== "string" || typeof row.parentHash !== "string") {
    throw new ZendoError("The Polygon block header is missing its number.", 502);
  }
  return {
    chainId: Number(BigInt(chainHex)),
    number: BigInt(row.number),
    hash: row.hash.toLowerCase(),
    parentHash: row.parentHash.toLowerCase(),
  };
}

export async function polygonLockLogs(bridge: string, fromBlock: bigint, toBlock: bigint): Promise<ObservedLock[]> {
  const result = await polygonCall("eth_getLogs", [{
    address: bridge,
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
    topics: [LOCKED_TOPIC],
  }]);
  return parseObservedLogs(result, bridge);
}
