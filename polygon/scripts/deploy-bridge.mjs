import { createRequire } from "node:module";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const require = createRequire(import.meta.url);

function signerFromEnv() {
  const explicit = process.env.BRIDGE_SIGNER || "";
  if (/^0x[0-9a-fA-F]{40}$/.test(explicit)) return explicit.toLowerCase();
  const raw = (process.env.ZENDO_BRIDGE_PRIVATE_KEY || "").trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) return "";
  const secret = Buffer.from(raw, "hex");
  const pub = secp256k1.getPublicKey(secret, false);
  const hash = keccak_256(pub.subarray(1));
  return `0x${Buffer.from(hash.subarray(12)).toString("hex")}`;
}

const broadcast = process.argv.includes("--broadcast");
const token = process.env.ZENDOCOIN_ADDRESS || "";
const signer = signerFromEnv();
const chainId = process.env.ZENDO_POLYGON_CHAIN_ID || "137";
const plan = {
  token: /^0x[0-9a-fA-F]{40}$/.test(token) ? token.toLowerCase() : "",
  signer,
  chainId,
  model: "lock-and-release",
  note: "Fund this contract with ZCOIN before release() can pay a voucher. The script does not print a private key.",
};

console.log(JSON.stringify(plan, null, 2));

if (!broadcast) {
  console.log("Dry run. Pass --broadcast with ZENDOCOIN_ADDRESS, a signer, POLYGON_RPC_URL, DEPLOYER_PRIVATE_KEY, and ZENDOBRIDGE_BYTECODE to deploy.");
  process.exit(0);
}

if (!plan.token || !plan.signer) {
  console.error("Broadcast needs ZENDOCOIN_ADDRESS and BRIDGE_SIGNER or ZENDO_BRIDGE_PRIVATE_KEY.");
  process.exit(1);
}
if (!process.env.POLYGON_RPC_URL || !process.env.DEPLOYER_PRIVATE_KEY || !process.env.ZENDOBRIDGE_BYTECODE) {
  console.error("Broadcast needs POLYGON_RPC_URL, DEPLOYER_PRIVATE_KEY, and ZENDOBRIDGE_BYTECODE.");
  process.exit(1);
}

let ethers;
try {
  ethers = require("ethers");
} catch {
  console.error("Install ethers before broadcasting.");
  process.exit(1);
}

const abi = [
  "constructor(address token_, address signer_, uint256 chainId_)",
];
const factory = new ethers.ContractFactory(abi, process.env.ZENDOBRIDGE_BYTECODE, new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)));
const contract = await factory.deploy(plan.token, plan.signer, BigInt(chainId));
await contract.waitForDeployment();
console.log(JSON.stringify({ bridge: await contract.getAddress() }));
