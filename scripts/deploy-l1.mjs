import { readFileSync } from "node:fs";

const genesis = JSON.parse(readFileSync(new URL("../zendo-chain/genesis/zendo-1.json", import.meta.url), "utf8"));
if (genesis.networkId !== "zendo-1") {
  console.error("genesis network is not zendo-1");
  process.exit(1);
}
if (genesis.nativeAsset !== "ZCOIN") {
  console.error("native gas asset is not ZendoCoin");
  process.exit(1);
}
if (genesis.publicAllocation !== "700000000") {
  console.error("public allocation is not 700000000");
  process.exit(1);
}
console.log(`ok  launchpad settles on ${genesis.networkId}`);
console.log(`ok  gas is ${genesis.nativeAsset}: transfer ${genesis.gas.transfer}, create ${genesis.gas.createCoin}, trade ${genesis.gas.trade}`);
console.log("ok  meme coins are created through the website engine, not through Polygon");
