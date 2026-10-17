import table from "../founders.json";

export type PolygonFounder = {
  id: string;
  name: string;
  role: string;
  amount: bigint;
  polygon: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function polygonLaunchPlan() {
  const founders: PolygonFounder[] = table.founders.map((founder) => ({
    id: founder.id,
    name: founder.name,
    role: founder.role,
    amount: BigInt(founder.amount) * 10n ** BigInt(table.decimals),
    polygon: founder.polygon,
  }));
  const founderUnits = founders.reduce((total, founder) => total + founder.amount, 0n);
  const publicUnits = BigInt(table.publicAllocation) * 10n ** BigInt(table.decimals);
  const expected = BigInt(table.totalSupply) * 10n ** BigInt(table.decimals);
  if (founderUnits + publicUnits !== expected) {
    throw new Error("Polygon allocations must equal the 1,000,000,000 ZendoCoin supply.");
  }
  if (table.chainId !== 137) throw new Error("ZendoCoin launches on Polygon mainnet only.");
  const louis = founders.find((founder) => founder.id === "louis-conner");
  if (!louis || louis.role !== "Co-founder and President") {
    throw new Error("Louis Conner must be Co-founder and President.");
  }
  for (const founder of founders) {
    if (!ADDRESS.test(founder.polygon)) throw new Error(`Set a Polygon address for ${founder.name}.`);
    if (founder.amount <= 0n) throw new Error(`Allocation for ${founder.name} must be greater than zero.`);
  }
  return {
    name: table.name,
    symbol: table.symbol,
    decimals: table.decimals,
    chainId: table.chainId,
    totalSupply: table.totalSupply,
    publicAllocation: table.publicAllocation,
    cliffDays: table.cliffDays,
    vestingYears: table.vestingYears,
    yearlyUnlockBps: table.yearlyUnlockBps,
    founders,
  };
}
