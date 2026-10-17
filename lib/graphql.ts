import { graphql, buildSchema } from "graphql";
import { cacheGet, cacheSet } from "./cache";
import { liveFeed } from "./engine";

const schema = buildSchema(`
  type ChainStatus {
    networkId: String!
    height: Int!
    coins: Int!
    accounts: Int!
  }
  type Price {
    symbol: String!
    mint: String!
    price: Float!
  }
  type Trade {
    hash: String!
    summary: String!
  }
  type Book {
    symbol: String!
    mint: String!
    venue: String!
    realZ: String!
    price: Float!
  }
  type LiveFeed {
    chain: ChainStatus!
    prices: [Price!]!
    trades: [Trade!]!
    books: [Book!]!
  }
  type Query {
    live: LiveFeed!
  }
`);

export async function runQuery(source: string) {
  return graphql({ schema, source, rootValue: { live: () => loadLive() } });
}

async function loadLive() {
  const cached = await cacheGet("graphql:live");
  if (cached) return JSON.parse(cached) as Awaited<ReturnType<typeof liveFeed>>;
  const live = await liveFeed();
  await cacheSet("graphql:live", JSON.stringify(live), 1);
  return live;
}
