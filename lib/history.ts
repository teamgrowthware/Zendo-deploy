export type HistoryFile = {
  address: string;
  displayName: string;
  exportedAt: number;
  transactions: {
    hash: string;
    at: number;
    type: string;
    from: string;
    to: string;
    symbol: string;
    amount: string;
    fee: string;
    summary: string;
  }[];
  staking: {
    stakes: { id: string; validatorId: string; amount: string; accrued: string }[];
    unbonding: { id: string; amount: string; readyHeight: number }[];
  };
  governance: {
    id: string;
    kind: "proposal" | "grant";
    title: string;
    status: string;
    filed: boolean;
    choice: string | null;
    weight: string | null;
    at: number;
  }[];
  memeCoins: {
    created: { mint: string; name: string; symbol: string; createdAt: number }[];
    trades: { id: string; at: number; mint: string; symbol: string; side: string; zBase: string; tokenBase: string }[];
    votes: { mint: string; symbol: string; direction: number }[];
  };
};

function cell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function historyToCsv(file: HistoryFile) {
  const rows = ["section,id,at,detail,amount,extra"];
  for (const tx of file.transactions) {
    rows.push([cell("transaction"), cell(tx.hash), cell(tx.at), cell(tx.summary), cell(tx.amount), cell(tx.symbol)].join(","));
  }
  for (const stake of file.staking.stakes) {
    rows.push([cell("stake"), cell(stake.id), "", cell(stake.validatorId), cell(stake.amount), cell(stake.accrued)].join(","));
  }
  for (const row of file.staking.unbonding) {
    rows.push([cell("unbonding"), cell(row.id), "", cell(row.readyHeight), cell(row.amount), ""].join(","));
  }
  for (const row of file.governance) {
    rows.push([cell("governance"), cell(row.id), cell(row.at), cell(row.title), cell(row.choice || ""), cell(row.kind)].join(","));
  }
  for (const coin of file.memeCoins.created) {
    rows.push([cell("meme-coin"), cell(coin.mint), cell(coin.createdAt), cell(coin.name), "", cell(coin.symbol)].join(","));
  }
  for (const trade of file.memeCoins.trades) {
    rows.push([cell("meme-trade"), cell(trade.id), cell(trade.at), cell(trade.side), cell(trade.zBase), cell(trade.symbol)].join(","));
  }
  for (const vote of file.memeCoins.votes) {
    rows.push([cell("meme-vote"), cell(vote.mint), "", cell(vote.symbol), cell(vote.direction), ""].join(","));
  }
  return `${rows.join("\n")}\n`;
}
