#!/usr/bin/env node

const base = process.env.ZENDO_URL || "http://127.0.0.1:38471";
const [cmd, arg] = process.argv.slice(2);

const help = `Zendo chain CLI

  npm run zendo -- status
  npm run zendo -- fees
  npm run zendo -- validators
  npm run zendo -- balance <znd1 address>
  npm run zendo -- node
  npm run zendo -- whitepaper

White paper for this release: ${base}/whitepaper
PDF: ${base}/whitepaper.pdf
Languages: ${base}/whitepaper?lang=es|zh|hi|ar
Source: docs/whitepaper-body.html

ZENDO_URL overrides the default ${base}
`;

async function get(path) {
  const res = await fetch(base + path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(help);
    return;
  }
  if (cmd === "whitepaper") {
    console.log(`${base}/whitepaper`);
    console.log(`${base}/whitepaper.pdf`);
    for (const code of ["es", "zh", "hi", "ar"]) console.log(`${base}/whitepaper?lang=${code}`);
    return;
  }
  if (cmd === "fees") return console.log(JSON.stringify(await get("/api/chain?view=fees"), null, 2));
  if (cmd === "validators") return console.log(JSON.stringify(await get("/api/chain?view=validators"), null, 2));
  if (cmd === "node") return console.log(JSON.stringify(await get("/api/node"), null, 2));
  if (cmd === "balance") {
    if (!arg) throw new Error("Pass an address.");
    const res = await fetch(`${base}/api/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "zendo_getBalance", params: [arg, "ZCOIN"] }),
    });
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }
  throw new Error(`Unknown command "${cmd}".`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
