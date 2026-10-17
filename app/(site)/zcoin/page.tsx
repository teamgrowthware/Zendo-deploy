import type { Metadata } from "next";
import { zcoin } from "@/lib/engine";
import { PageIntro } from "@/components/chrome";
import { ZendoCoinZipLink } from "@/components/zendocoin-zip";
import Link from "next/link";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ZendoCoin" };

export default async function Page() {
  const coin = await zcoin();
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-12">
      <PageIntro mark="coin" kicker={coin.symbol} title="ZendoCoin" body={coin.launched ? `${coin.decimals} decimals. Base supply plus staking emissions. Ticker ${coin.symbol}. Louis Conner is Co-founder and President. Public launch started ${new Date(coin.anchor || 0).toUTCString()}. The 120-day cliff runs from that moment.` : `${coin.decimals} decimals. Base supply plus staking emissions. Ticker ${coin.symbol}. Louis Conner is Co-founder and President. Public launch has not happened, so founder coins stay locked. The 120-day cliff starts when this app is first live for public use.`} />
      <div className="zendo-mb-4 zendo-flex zendo-flex-wrap zendo-gap-3">
        <ZendoCoinZipLink className="zendo-pointer zendo-inline-flex zendo-h-12 zendo-items-center zendo-justify-center zendo-rounded-full zendo-bg-gold zendo-px-5 zendo-text-base zendo-font-semibold zendo-text-ink">Download ZendoCoin-Polygon_Mainnet.zip</ZendoCoinZipLink>
        <Link href="/contracts" className="zendo-pointer zendo-inline-flex zendo-h-12 zendo-items-center zendo-justify-center zendo-rounded-full zendo-bg-lime zendo-px-5 zendo-text-base zendo-font-semibold zendo-text-ink">Copy the contracts</Link>
      </div>
      <div className="zendo-grid zendo-gap-3 zendo-sm:zendo-grid-cols-2">
        {[
          ["Supply in circulation math", coin.supply],
          ["Staking emissions minted", coin.issuedRewards],
          ["Founder allocation", coin.founder],
          ["Public allocation", coin.publicAllocation],
          ["Unlocked by the schedule", coin.vested],
          ["Already claimed", coin.claimed],
          ["Claimable now", coin.claimable],
          ["Faucet", coin.faucet],
          ["Treasury", coin.treasury],
          ["Public pool", coin.community],
          ["Staked or unbonding", coin.staked],
          ["Liquid outside founder locks", coin.liquid],
        ].map(([k, v]) => (
          <Panel key={k}>
            <p className="zendo-text-xs zendo-text-muted">{k}</p>
            <p className="num zendo-mt-1 zendo-text-xl zendo-font-semibold">{v}</p>
          </Panel>
        ))}
      </div>
      <Panel className="zendo-mt-4">
        <h2 className="zendo-font-semibold">Vesting schedule</h2>
        <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">{coin.launched ? `Public launch is recorded. Nothing vests during the ${coin.cliffDays}-day cliff, including the cliff day.` : `The launch date is not set. Nothing unlocks until Zendo is live online for public use.`} After that, each founder unlocks 25% of their own allocation each year for {coin.years} years. The chain moves those coins into the founder wallets on its own. No operator has to start the clock or press a claim.</p>
        <div className="zendo-mt-4 zendo-grid zendo-gap-3">
          {coin.founders.map((founder) => (
            <div key={founder.id} className="zendo-rounded-2xl zendo-border zendo-border-line zendo-p-3 zendo-text-sm">
              <p className="zendo-font-semibold">{founder.name}</p>
              <p className="zendo-text-xs zendo-text-gold">{founder.role}</p>
              <p className="zendo-mt-1 zendo-text-muted">Allocation {founder.allocation} · vested {founder.vested} · claimed {founder.claimed} · claimable {founder.claimable} Z</p>
              <p className="zendo-mt-1 zendo-break-all zendo-text-xs zendo-text-muted">Polygon {founder.polygon}</p>
              <p className="zendo-mt-1 zendo-break-all zendo-text-xs zendo-text-muted">Vesting {founder.vestingAddress}</p>
              <p className="zendo-mt-1 zendo-break-all zendo-text-xs zendo-text-muted">Wallet {founder.walletAddress}</p>
            </div>
          ))}
        </div>
        <div className="zendo-mt-3 zendo-grid zendo-gap-2 zendo-text-sm">
          {coin.schedule.map((row) => (
            <div key={row.label} className="zendo-flex zendo-justify-between zendo-gap-3">
              <span>{row.label}{coin.launched ? ` · ${new Date(row.at).toISOString().slice(0, 10)}` : " · after public launch"}</span>
              <span className={row.unlocked ? "zendo-text-lime" : "zendo-text-muted"}>{row.amount} Z {row.unlocked ? "unlocked" : "locked"}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="zendo-mt-4">
        <h2 className="zendo-font-semibold">Launch on Polygon mainnet</h2>
        <p className="zendo-mt-2 zendo-text-sm zendo-leading-6 zendo-text-muted">The free website is Remix. Open it in the browser, paste the three contracts from the zip, and send one transaction with MetaMask on Polygon. Remix does not charge a fee and does not ask for a card. MetaMask will show a Polygon network fee in POL before you confirm. That fee is the only cost.</p>
        <div className="zendo-mt-4 zendo-overflow-x-auto">
          <table className="zendo-w-full zendo-min-w-[520px] zendo-text-left zendo-text-sm">
            <tbody>
              {[
                ["Name", "ZendoCoin"],
                ["Ticker", "$ZCoin"],
                ["Decimals", "18"],
                ["Total supply", "1,000,000,000"],
                ["Network", "Polygon mainnet, chain id 137"],
                ["Louis Conner, Co-founder and President", "200,000,000 locked · 0x18a0730008034177b40F1172aA5953a37dAE7102"],
                ["Prabhat Agrawal", "50,000,000 locked · 0xD319679625599303393084671a3AdaB52ea999B3"],
                ["Pratyaksh Lutare", "50,000,000 locked · 0x3336a52Cd82F01956147aed641F35694a235fbc9"],
                ["Founder total", "300,000,000"],
                ["Public allocation", "700,000,000, sent to the address you type at deploy"],
                ["Cliff", "120 days. Nothing can be released, including on day 120."],
                ["Vesting", "4 years. 25% of each founder's own coins at each 365-day anniversary."],
                ["Year 1 release", "Louis 50,000,000 · Prabhat 12,500,000 · Pratyaksh 12,500,000"],
                ["After year 4", "100% of each founder allocation"],
              ].map(([k, v]) => (
                <tr key={k} className="zendo-border-t zendo-border-line first:zendo-border-t-0">
                  <td className="zendo-py-2 zendo-pr-3 zendo-text-muted">{k}</td>
                  <td className="zendo-py-2 zendo-break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ol className="zendo-mt-4 zendo-list-decimal zendo-space-y-2 zendo-pl-5 zendo-text-sm zendo-leading-6 zendo-text-muted">
          <li>Open <a className="zendo-text-lime" href="https://remix.ethereum.org" target="_blank" rel="noopener">remix.ethereum.org</a>. No account.</li>
          <li>In the file list, make a folder and add ZendoCoin.sol, ZendoCoinVesting.sol, and ZendoCoinLaunch.sol from the zip. Keep them in the same folder.</li>
          <li>Open the compiler. Choose Solidity 0.8.24. Turn on optimization and set runs to 200. Compile ZendoCoinLaunch.sol.</li>
          <li>In MetaMask, select Polygon Mainnet. Name Polygon Mainnet, RPC https://polygon-bor-rpc.publicnode.com, chain id 137, symbol POL, explorer https://polygonscan.com. Put a little POL in that wallet for the network fee.</li>
          <li>In Remix, open Deploy. Environment: Injected Provider - MetaMask. Contract: ZendoCoinLaunch. The wallet must say Polygon, chain 137. Any other chain reverts.</li>
          <li>In publicRecipient, paste the wallet that should receive the 700,000,000 public coins. Your own MetaMask address is the usual choice. Then click Deploy and confirm in MetaMask.</li>
          <li>After the transaction, open the deployed ZendoCoinLaunch and read token() and vesting(). Save both addresses. In MetaMask, import the token address with symbol $ZCoin and 18 decimals.</li>
          <li>Founder coins stay in the vesting contract. On day 365 and each anniversary after that, the founder connects their own wallet on polygonscan.com, opens the vesting contract, and calls release(). A founder receives only their own unlocked coins.</li>
        </ol>
      </Panel>
    </div>
  );
}
