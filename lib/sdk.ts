export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Request failed.";
    throw new Error(message);
  }
  return data as T;
}

export type ZendoSdk = ReturnType<typeof createZendoClient>;

/** Chain client. Supply, vesting, and fees are in docs/whitepaper-body.html. */
export function createZendoClient(baseUrl = "") {
  const get = <T>(path: string) => api<T>(`${baseUrl}${path}`);
  const post = <T>(path: string, body?: unknown) =>
    api<T>(`${baseUrl}${path}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    connectNode: () => get<import("./types").ChainStatus>("/api/chain?view=status"),
    getBalance: async (address: string, token = "ZCOIN") => {
      const data = await post<{ result: { amount: string; token: string } }>("/api/rpc", {
        jsonrpc: "2.0",
        id: 1,
        method: "zendo_getBalance",
        params: [address, token],
      });
      return data.result;
    },
    estimateGas: () => get<import("./types").FeeSchedule>("/api/chain?view=fees"),
    sendTransaction: (input: { to: string; token?: string; amount: string }) => post("/api/wallet/send", input),
    deployContract: (input: { name: string; symbol: string; description: string; emoji: string; hue: number }) => post("/api/coins", input),
    callContract: (input: { mint: string; method: "trade" | "reply"; side?: "buy" | "sell"; amount?: string; body?: string; tx?: unknown }) => {
      if (input.method === "reply") return post(`/api/coins/${input.mint}/reply`, { body: input.body });
      return post(`/api/coins/${input.mint}/trade`, { side: input.side, amount: input.amount, tx: input.tx });
    },
    stakeTokens: (input: { validatorId: string; amount: string; tx?: unknown }) => post("/api/stake/delegate", input),
    voteProposal: (proposalId: string, choice: boolean | "yes" | "no" | "abstain", tx?: unknown) =>
      post(`/api/governance/${proposalId}`, { choice: choice === true || choice === "yes" ? "yes" : choice === false || choice === "no" ? "no" : "abstain", tx }),
    propose: (input: { title: string; body: string; key: string; value: string }) => post("/api/governance", input),
    fileGrant: (input: { title: string; body: string; milestone: string; amount: string }) => post("/api/grants", input),
    voteGrant: (grantId: string, choice: "yes" | "no") => post(`/api/grants/${grantId}`, { choice }),
    publishListing: (input: { name: string; summary: string; kind: "contract" | "sdk" | "app" }) => post("/api/market", input),
    nodeCall: (input: { from: string; to: string; data?: string; value?: number; gas?: number }) =>
      post<{ result: { status: string; gasUsed: number; returnData: string; reason: string } }>("/api/node", { method: "zendo_call", params: [input] }),
    nodeStaking: () => post<{ result: { address: string; bonds: { delegator: string; validator: number; amount: number }[] } }>("/api/node", { method: "zendo_staking", params: [] }),
    nodeGovernance: (contract: string) =>
      post<{ result: { contract: string; proposals: { id: number; yes: number; no: number }[] } }>("/api/node", { method: "zendo_governance", params: [contract] }),
    nodeValidators: () => post<{ result: { index: number; address: string; balance: number; publicKey: string }[] }>("/api/node", { method: "zendo_validators", params: [] }),
    subscribeEvents: (onBlock: (status: import("./types").ChainStatus) => void) => {
      const source = new EventSource(`${baseUrl}/api/stream`);
      source.addEventListener("block", (event) => {
        onBlock(JSON.parse((event as MessageEvent).data));
      });
      return () => source.close();
    },
  };
}
