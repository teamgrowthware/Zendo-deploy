import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function firstExisting(paths) {
  for (const path of paths) {
    if (existsSync(path)) return path;
  }
  throw new Error(`Missing file. Looked in ${paths.join(", ")}`);
}

const table = JSON.parse(readFileSync(firstExisting([
  join(here, "../founders.json"),
  join(here, "../../founders.json"),
]), "utf8"));

const broadcast = process.argv.includes("--broadcast");
const louis = table.founders.find((row) => row.id === "louis-conner");
const sum = table.founders.reduce((total, row) => total + BigInt(row.amount), 0n) + BigInt(table.publicAllocation);
if (sum !== BigInt(table.totalSupply)) {
  throw new Error("Founder allocations plus the public allocation must equal 1,000,000,000.");
}
if (table.chainId !== 137) throw new Error("ZendoCoin launches on Polygon mainnet, chain id 137.");
if (!louis || louis.role !== "Co-founder and President") {
  throw new Error("Louis Conner must be recorded as Co-founder and President.");
}

const publicEnv = process.env.POLYGON_ADDR_PUBLIC || "";
console.log("ZendoCoin on Polygon mainnet");
console.log(`${table.name}  ${table.symbol}  ${table.decimals} decimals  chain ${table.chainId}`);
console.log(`Supply ${table.totalSupply}`);
console.log(`Public allocation ${table.publicAllocation} goes to ${publicEnv || "the deployer wallet"}`);
for (const founder of table.founders) {
  console.log(`${founder.name} (${founder.role})\t${founder.amount}\t${founder.polygon}`);
}
console.log(`Vesting: ${table.cliffDays}-day cliff with nothing released, then ${table.yearlyUnlockBps / 100}% of each founder allocation each year for ${table.vestingYears} years.`);

if (!broadcast) {
  console.log("Dry run. Pass --broadcast with POLYGON_RPC_URL and DEPLOYER_PRIVATE_KEY to deploy. The key is never printed.");
  process.exit(0);
}

const rpc = process.env.POLYGON_RPC_URL || "";
const key = process.env.DEPLOYER_PRIVATE_KEY || "";
if (!rpc.startsWith("https://") || !key) {
  console.error("Broadcast needs an https POLYGON_RPC_URL and DEPLOYER_PRIVATE_KEY.");
  process.exit(1);
}
if (/[a-fA-F0-9]{32}/.test(rpc) && rpc.includes(key.replace(/^0x/, "").slice(0, 8))) {
  console.error("Refusing to print or embed the deployer key in the RPC URL.");
  process.exit(1);
}

const artifact = JSON.parse(readFileSync(firstExisting([
  join(here, "../artifacts/ZendoCoinLaunch.json"),
]), "utf8"));
const { ethers } = await import("ethers").catch(() => {
  console.error("Install ethers before broadcasting: npm install ethers");
  process.exit(1);
});

const provider = new ethers.JsonRpcProvider(rpc, 137);
const network = await provider.getNetwork();
if (network.chainId !== 137n) {
  console.error(`Refusing to deploy. The RPC reports chain ${network.chainId}, and ZendoCoin is Polygon mainnet only.`);
  process.exit(1);
}

const wallet = new ethers.Wallet(key, provider);
const publicRecipient = /^0x[0-9a-fA-F]{40}$/.test(publicEnv) ? publicEnv : wallet.address;
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy(publicRecipient);
const deployed = await contract.waitForDeployment();
const launchAddress = await deployed.getAddress();
const tokenAddress = await deployed.token();
const vestingAddress = await deployed.vesting();
console.log(`Launch ${launchAddress}`);
console.log(`ZendoCoin ${tokenAddress}`);
console.log(`Vesting ${vestingAddress}`);
console.log(`Public allocation wallet ${publicRecipient}`);
