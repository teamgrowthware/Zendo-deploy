const raw = (process.env.QUICKNODE_POLYGON_RPC_URL || process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com").trim();
const endpoint = new URL(raw);
if (endpoint.protocol !== "https:") {
  console.error("The Polygon RPC URL must use https.");
  process.exit(1);
}
const configured = Boolean(process.env.QUICKNODE_POLYGON_RPC_URL || process.env.POLYGON_RPC_URL);
console.log(`Polygon RPC host ${endpoint.host}${configured ? "" : " (public fallback until QUICKNODE_POLYGON_RPC_URL or POLYGON_RPC_URL is set)"}`);

async function call(method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || "rpc error");
  return body.result;
}

const chainId = Number(BigInt(await call("eth_chainId", [])));
if (chainId !== 137) {
  console.error(`Expected Polygon mainnet chain id 137, got ${chainId}.`);
  process.exit(1);
}
const header = await call("eth_getBlockByNumber", ["latest", false]);
if (!header?.number || !header.hash || !header.parentHash) {
  console.error("The block header is missing number, hash, or parent hash.");
  process.exit(1);
}
const full = await call("eth_getBlockByNumber", [header.number, false]);
const txHash = Array.isArray(full.transactions) && full.transactions.length ? full.transactions[0] : null;
let receiptStatus = "no transaction in the latest block";
if (typeof txHash === "string") {
  const receipt = await call("eth_getTransactionReceipt", [txHash]);
  if (!receipt?.status || !receipt.blockHash) {
    console.error("The transaction receipt is missing status or block hash.");
    process.exit(1);
  }
  receiptStatus = `${txHash} status ${receipt.status} block ${receipt.blockNumber}`;
} else {
  const mined = await call("eth_getBlockByNumber", [header.number, true]);
  const tx = Array.isArray(mined.transactions) ? mined.transactions.find((item) => item && item.hash) : null;
  if (!tx) {
    console.error("The latest block has no transaction to verify.");
    process.exit(1);
  }
  const receipt = await call("eth_getTransactionReceipt", [tx.hash]);
  if (!receipt?.status) {
    console.error("The transaction receipt is missing a status.");
    process.exit(1);
  }
  receiptStatus = `${tx.hash} status ${receipt.status} block ${receipt.blockNumber}`;
}
console.log(`chain ${chainId}`);
console.log(`head ${header.number} ${header.hash}`);
console.log(`parent ${header.parentHash}`);
console.log(`receipt ${receiptStatus}`);
