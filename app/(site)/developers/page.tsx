import type { Metadata } from "next";
import Link from "next/link";
import { CodeSample } from "@/components/code-sample";
import { PageIntro } from "@/components/chrome";

export const metadata: Metadata = { title: "Developers" };

const tsSample = `import { createZendoClient } from "./lib/sdk";

const zendo = createZendoClient("http://127.0.0.1:38471");
await zendo.connectNode();
await zendo.getBalance("znd1...", "ZCOIN");
await zendo.estimateGas();
await zendo.sendTransaction({ to: "znd1...", amount: "1", token: "ZCOIN" });
await zendo.deployContract({ name: "Pond Frog", symbol: "FROG", description: "A frog on-chain.", emoji: "🐸", hue: 88 });
await zendo.callContract({ mint, method: "trade", side: "buy", amount: "0.5" });
await zendo.stakeTokens({ validatorId, amount: "10" });
await zendo.voteProposal(proposalId, true);
const stop = zendo.subscribeEvents((status) => console.log(status.height));`;

const cliSample = `npm run zendo -- status
npm run zendo -- fees
npm run zendo -- validators
npm run zendo -- balance znd1...`;

const kotlinSample = `val zendo = ZendoClient("http://127.0.0.1:38471")
zendo.connectNode()
zendo.getBalance("znd1...", "ZCOIN")
zendo.stakeTokens(validatorId, "10")`;

const swiftSample = `let zendo = ZendoClient()
try await zendo.connectNode()
try await zendo.getBalance(address: "znd1...", token: "ZCOIN")
try await zendo.stakeTokens(validatorId: validatorId, amount: "10")`;

export default function Page() {
  return (
    <article className="zendo-mx-auto zendo-max-w-3xl zendo-space-y-6 zendo-px-4 zendo-py-12 zendo-text-sm zendo-leading-7 zendo-text-muted">
      <PageIntro mark="chain" kicker="Developers" title="Build on zendo-1" body="The TypeScript client talks to this node. JSON-RPC covers reads. Writes go through the signed-in wallet routes." />
      <CodeSample title="TypeScript" code={tsSample} href="/learn" link="Open the learn page" />
      <CodeSample title="CLI" code={cliSample} href="/explorer" link="Open the explorer" />
      <CodeSample title="Kotlin" code={kotlinSample} href="/developers" link="TypeScript, Kotlin, and Swift" />
      <CodeSample title="Swift" code={swiftSample} href="/learn" link="Open the learn page" />
      <p>JSON-RPC lives at <span className="zendo-text-cream">POST /api/rpc</span>. Methods: <span className="zendo-text-cream">zendo_chainId</span>, <span className="zendo-text-cream">zendo_blockNumber</span>, <span className="zendo-text-cream">zendo_getBalance</span>, <span className="zendo-text-cream">zendo_getBlockByHeight</span>, <span className="zendo-text-cream">zendo_getTransactionByHash</span>, <span className="zendo-text-cream">zendo_estimateGas</span>, <span className="zendo-text-cream">zendo_call</span>. Chain reads and writes have no per-minute cap. Live blocks stream from <span className="zendo-text-cream">GET /api/stream</span> as <span className="zendo-text-cream">event: block</span>.</p>
      <p>Kotlin and Swift clients in <span className="zendo-text-cream">sdk/</span> call the same HTTP routes. Network parameters, including gas and the validator set, are in <span className="zendo-text-cream">zendo-blockchain.toml</span>.</p>
      <p>
        The Rust process in <span className="zendo-text-cream">node/</span> keeps its own blocks. It learns peers by exchanging listen addresses, prefers a lower measured round trip, and will switch to a longer chain when the shared ancestor is at or above the finalized height. A second validator can join that same genesis before the first block and keep depth finality moving while the other signer is quiet. Vote finality still waits for a quorum. A <span className="zendo-text-cream">--region</span> label rides along in the hello message. Its RPC, bound to localhost, adds <span className="zendo-text-cream">zendo_consensus</span>, <span className="zendo-text-cream">zendo_peers</span>, <span className="zendo-text-cream">zendo_getCode</span>, and <span className="zendo-text-cream">zendo_getStorage</span>. The explorer page at <span className="zendo-text-cream">/explorer/consensus</span> polls the peer and fork methods through <span className="zendo-text-cream">GET /api/node</span>.
      </p>
      <p>
        That process also executes contract bytecode. Deploy by sending <span className="zendo-text-cream">data</span> to the zero address. Call by sending a transaction to the deployed address. The deploying account can replace the code with a payload that starts with <span className="zendo-text-cream">A1</span>, or restore the previous body with <span className="zendo-text-cream">A2</span>. <span className="zendo-text-cream">zendo_call</span> runs the same code without writing state. <span className="zendo-text-cream">zendo_governance</span> reads a governance contract&apos;s tallies, and <span className="zendo-text-cream">zendo_staking</span> lists bonds held at the stake address. Opcodes cover push, arithmetic, storage, logs, jumps, caller, balance, calldata, native sends, and a depth-limited call that forwards one selector and one argument. Gas is the fee. A revert rolls the storage back and burns the gas used. <span className="zendo-text-cream">node/src/contracts.rs</span> builds a token, a cliff vesting schedule, a constant-product curve, a one-ballot governance contract, an NFT, and an identity registry whose reader calls the registry. Those programs live on the Rust node. The website launchpad, vesting, and governance still settle in the TypeScript ledger.
      </p>
      <p>Simultaneous transactions join one ordered batch and share one commit. Promoted launchpad slots and the optional MEV skim are the paid surfaces. MEV here is a config switch that adds 5 basis points to the protocol side of a trade. It does not reorder anyone else&apos;s transactions on a public mempool, because this node is the only producer.</p>
      <p>Nested reads are <span className="zendo-text-cream">POST /api/graphql</span>. The <span className="zendo-text-cream">live</span> query returns chain height, the latest prices, recent trades, and the launchpad book in one response. The same feed is pushed on the stream as <span className="zendo-text-cream">event: market</span>. Prices and the book are cached for one second. Set <span className="zendo-text-cream">ZENDO_REDIS_URL</span> to a Valkey or Redis URL and that cache is shared, including sign-in and PIN attempt counts. The signed session cookie stays the session. gRPC listens only when <span className="zendo-text-cream">ZENDO_GRPC_PORT</span> is set. <span className="zendo-text-cream">proto/zendo.proto</span> is the contract. Each send writes a debit and a credit into the journal and the transfers table in the same database transaction. A TigerBeetle cluster is used only when <span className="zendo-text-cream">TIGERBEETLE_ADDRESSES</span> is set on a machine that is already running TigerBeetle. This app does not start that cluster. The screens still use the existing routes.</p>
      <p>The <Link href="/whitepaper" className="zendo-text-lime">white paper</Link> is the release note for supply, vesting, and fees. <code>npm run whitepaper</code> reprints <span className="zendo-text-cream">public/whitepaper.pdf</span> from <span className="zendo-text-cream">docs/whitepaper-body.html</span> using the version in package.json.</p>
    </article>
  );
}
