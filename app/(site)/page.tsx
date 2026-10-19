import Link from "next/link";
import { home } from "@/lib/engine";
import { Button } from "@/components/ui";
import { Logo, PriceChart } from "@/components/chrome";
import { ZendoL1ZipLink } from "@/components/zendo-l1-zip";
import { ZendoCoinZipLink } from "@/components/zendocoin-zip";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await home();
  return (
    <div>
      <section className="zendo-mx-auto zendo-grid zendo-max-w-6xl zendo-gap-10 zendo-px-4 zendo-py-14 zendo-lg:zendo-grid-cols-[1.1fr_0.9fr] zendo-lg:zendo-items-center">
        <div>
          <Logo className="zendo-home-hero-logo" />
          <p className="zendo-mt-6 zendo-text-xs zendo-font-semibold zendo-uppercase zendo-tracking-[0.18em] zendo-text-lime">
            {data.status.chainName} · height {data.status.height} · {data.status.blockTimeMs / 1000}s slots
          </p>
          <h1 className="zendo-mt-4 zendo-font-display zendo-text-4xl zendo-font-bold zendo-leading-[1.05] zendo-tracking-tight zendo-sm:zendo-text-5xl">
            Host the chain. Launch the coin. Keep the keys.
          </h1>
          <p className="zendo-mt-5 zendo-max-w-xl zendo-text-lg zendo-leading-8 zendo-text-muted">
            Zendo is a persistent proof-of-stake chain, the ZendoCoin ledger, and a bonding-curve launchpad. You run the node. Balances stay in the wallets that created them.
          </p>
          <div className="zendo-mt-7 zendo-flex zendo-flex-wrap zendo-gap-3">
            <ZendoL1ZipLink className="zendo-pointer zendo-inline-flex zendo-h-12 zendo-items-center zendo-justify-center zendo-rounded-full zendo-bg-gold zendo-px-5 zendo-text-base zendo-font-semibold zendo-text-ink">Download ZendoDeployL1.zip</ZendoL1ZipLink>
            <Button size="lg" asChild><Link href="/signup">Create a wallet</Link></Button>
            <Button size="lg" variant="outline" asChild><Link href="/launchpad">Browse the launchpad</Link></Button>
            <Button size="lg" variant="outline" asChild><Link href="/whitepaper">Read the white paper</Link></Button>
            <ZendoCoinZipLink className="zendo-pointer zendo-inline-flex zendo-h-12 zendo-items-center zendo-justify-center zendo-rounded-full zendo-border zendo-border-line zendo-px-5 zendo-text-base zendo-font-semibold zendo-text-cream">Polygon contracts</ZendoCoinZipLink>
            <Button size="lg" variant="outline" asChild><a href="/Zendo.apk">Android APK</a></Button>
          </div>
          <dl className="zendo-mt-8 zendo-grid zendo-grid-cols-1 zendo-gap-3 zendo-text-sm zendo-sm:zendo-grid-cols-3">
            <Stat k="Coins" v={String(data.status.coins)} />
            <Stat k="Validators" v={String(data.status.validators)} />
            <Stat k="TPS" v={String(data.status.tps)} />
          </dl>
        </div>
        <div className="zendo-grid zendo-gap-3">
          {data.coins.slice(0, 3).map((coin) => (
            <Link key={coin.mint} href={`/launchpad/${coin.mint}`} className="zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-panel zendo-p-4 hover:zendo-border-lime/40">
              <div className="zendo-flex zendo-items-center zendo-gap-3">
                <span className="zendo-text-2xl">{coin.emoji}</span>
                <div>
                  <p className="zendo-font-semibold">{coin.name}</p>
                  <p className="zendo-text-xs zendo-text-muted">${coin.symbol} · mcap {coin.marketCap} Z</p>
                </div>
                <span className={`zendo-ml-auto zendo-text-sm ${coin.changeUp ? "zendo-text-lime" : "zendo-text-coral"}`}>{coin.change}</span>
              </div>
              <PriceChart points={coin.chart} up={coin.changeUp} />
            </Link>
          ))}
        </div>
      </section>
      <section className="zendo-mx-auto zendo-grid zendo-max-w-6xl zendo-gap-4 zendo-px-4 zendo-pb-6 zendo-md:zendo-grid-cols-3">
        {[
          ["Node", "Gossip-style peer table, a mempool, PoS proposers, and blocks that finalize after a short depth. Optional PoH slots are just an ordered counter."],
          ["ZendoCoin", "1,000,000,000 $ZCoin. Louis Conner, Co-founder and President, holds 200,000,000. Prabhat Agrawal and Pratyaksh Lutare hold 50,000,000 each. 700,000,000 is public. Vesting: 120-day cliff, then 25% of each founder allocation each year."],
          ["Launchpad", "Create a coin, trade a constant-product curve, and graduate into a pool once the raise clears the threshold in zendo-blockchain.toml."],
        ].map(([title, body]) => (
          <article key={title} className="zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-panel zendo-p-5">
            <h2 className="zendo-font-display zendo-text-2xl zendo-font-bold">{title}</h2>
            <p className="zendo-mt-2 zendo-text-sm zendo-leading-6 zendo-text-muted">{body}</p>
          </article>
        ))}
      </section>
      <section id="fees" className="zendo-mx-auto zendo-max-w-6xl zendo-px-4 zendo-py-10">
        <h2 className="zendo-font-display zendo-text-3xl zendo-font-bold">Fees you can read</h2>
        <div className="zendo-mt-4 zendo-overflow-x-auto zendo-rounded-3xl zendo-border zendo-border-line">
          <table className="zendo-w-full zendo-min-w-[520px] zendo-text-left zendo-text-sm">
            <tbody>
              {[
                ["Transfer", `${data.fees.transfer} Z`],
                ["Create a coin", `${data.fees.createCoin} Z`],
                ["Trade", `${data.fees.tradePct}% plus ${data.fees.tradeGas} Z gas`],
                ["Creator share of a trade", `${data.fees.creatorPct}% of notional`],
                ["Promote a coin", `${data.fees.promote} Z for 24h`],
                ["Stake / vote / propose", `${data.fees.stake} / ${data.fees.vote} / ${data.fees.proposal} Z`],
                ["Staking emission", `${data.fees.apr}% APR before commission`],
                ["New wallet", data.fees.airdrop === "0" ? "0 Z. The faucet is closed." : `${data.fees.airdrop} Z from the faucet`],
              ].map(([k, v]) => (
                <tr key={k} className="zendo-border-t zendo-border-line first:zendo-border-t-0">
                  <td className="zendo-px-4 zendo-py-3 zendo-text-muted">{k}</td>
                  <td className="zendo-px-4 zendo-py-3">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="zendo-mx-auto zendo-grid zendo-max-w-6xl zendo-gap-6 zendo-px-4 zendo-py-6 zendo-lg:zendo-grid-cols-2">
        <div>
          <h2 className="zendo-font-display zendo-text-3xl zendo-font-bold">Non-custodial by construction</h2>
          <div className="zendo-mt-4 zendo-space-y-3 zendo-text-sm zendo-leading-6 zendo-text-muted">
            <p>Zendo never holds a pooled wallet. A new account derives its address from a 12-word phrase that the server hashes and then drops. Balances live in that address on this node.</p>
            <p>Minting and trading happen in the launchpad state machine. If you later add fiat, a licensed processor would have to do that work. This software does not move money between bank accounts.</p>
            <p>Whether an operator needs a money-transmitter license depends on what they actually do, and on the law where they operate. This page is the design, not a legal opinion. Read the terms and talk to counsel before treating any fork as a live financial service.</p>
            <p>{data.vesting.launched ? `Public launch ${new Date(data.vesting.anchor || 0).toUTCString()}. Founder vesting unlocked so far: ${data.vesting.unlockedPct}. Claimable into founder wallets: ${data.vesting.claimable} Z.` : `Public launch has not happened. Founder coins stay locked until Zendo is live for public use. Claimable now: ${data.vesting.claimable} Z.`} The system wallet does not receive those coins.</p>
          </div>
        </div>
        <div className="zendo-rounded-3xl zendo-border zendo-border-line zendo-bg-panel zendo-p-5">
          <h3 className="zendo-font-semibold">Ship it on a small machine</h3>
          <ol className="zendo-mt-3 zendo-list-decimal zendo-space-y-2 zendo-pl-5 zendo-text-sm zendo-leading-6 zendo-text-muted">
            <li>Boot the Next.js node. It reads <span className="zendo-text-cream">zendo-blockchain.toml</span>.</li>
            <li>Create accounts. New wallets start at 0 ZCoin. The faucet does not pay them.</li>
            <li>Launch a coin or delegate to a validator.</li>
            <li>Watch blocks, fees, and proposals in the explorer and the operator desk.</li>
          </ol>
          <Button className="zendo-mt-5" asChild><Link href="/developers">Read the SDK</Link></Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="zendo-rounded-2xl zendo-border zendo-border-line zendo-px-3 zendo-py-3">
      <dt className="zendo-text-xs zendo-text-muted">{k}</dt>
      <dd className="num zendo-text-xl zendo-font-semibold">{v}</dd>
    </div>
  );
}
