import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ContractCopy } from "@/components/contract-copy";

export const dynamic = "force-dynamic";

const FILES = ["ZendoCoin.sol", "ZendoCoinVesting.sol", "ZendoCoinLaunch.sol", "ZendoBridge.sol"] as const;

export default function Page() {
  const contracts = FILES.map((name) => ({
    name,
    source: readFileSync(join(process.cwd(), "polygon", "contracts", name), "utf8"),
  }));

  return (
    <div className="zendo-mx-auto zendo-grid zendo-max-w-3xl zendo-gap-4 zendo-px-4 zendo-py-12">
      <div>
        <p className="zendo-text-xs zendo-font-semibold zendo-uppercase zendo-tracking-[0.18em] zendo-text-lime">Contracts</p>
        <h1 className="zendo-mt-2 zendo-font-display zendo-text-4xl zendo-font-bold">Copy each contract</h1>
        <p className="zendo-mt-3 zendo-text-sm zendo-leading-6 zendo-text-muted">Tap Copy on a box. That copies the whole file. Deploy ZendoCoinLaunch.sol. ZendoBridge.sol is separate.</p>
      </div>
      {contracts.map((contract) => (
        <ContractCopy key={contract.name} name={contract.name} source={contract.source} />
      ))}
    </div>
  );
}
