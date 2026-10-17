import { ChainBlock, ChainSource } from "./reconcile";
import { L1Tx, txId } from "./tx";

export type Receipt = { height: number | null; finalized: boolean };
export type Power = { address: string; balance: string; bonds: string; power: string };
export type Simulation = { status: string; gasUsed: number; returnData: string; logs: { address: string; topic: string; data: string }[]; reason: string };

type RpcError = { code: number; message: string };

export class L1Client {
  constructor(
    private readonly url: string = "http://127.0.0.1:47111",
    private readonly timeoutMs: number = 8_000,
  ) {}

  static fromEnv(): L1Client {
    return new L1Client((process.env.ZENDO_L1_RPC || "http://127.0.0.1:47111").trim());
  }

  async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
        cache: "no-store",
      });
      const payload = (await response.json()) as { result?: T; error?: RpcError };
      if (payload.error) throw new Error(payload.error.message);
      return payload.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  submit(tx: L1Tx): Promise<{ id: string; accepted: boolean }> {
    return this.rpc("zendo_sendTransaction", [tx]);
  }

  receipt(id: string): Promise<Receipt> {
    return this.rpc("zendo_receipt", [id]);
  }

  balance(address: string): Promise<string> {
    return this.rpc("zendo_getBalance", [address]);
  }

  nonce(address: string): Promise<number> {
    return this.rpc("zendo_nonce", [address]);
  }

  power(address: string): Promise<Power> {
    return this.rpc("zendo_power", [address]);
  }

  supply(): Promise<{ total: string; cap: string }> {
    return this.rpc("zendo_supply", []);
  }

  contractAddress(from: string, nonce: number): Promise<string> {
    return this.rpc("zendo_contractAddress", [from, nonce]);
  }

  launchProgram(): Promise<string> {
    return this.rpc("zendo_launchProgram", []);
  }

  governanceProgram(): Promise<string> {
    return this.rpc("zendo_governanceProgram", []);
  }

  call(input: { from: string; to: string; data?: string; value?: string | number }): Promise<Simulation> {
    return this.rpc("zendo_call", [input]);
  }

  blockNumber(): Promise<number> {
    return this.rpc("zendo_blockNumber", []);
  }

  /** Reads a finalized block and normalizes each transaction to the shape the reconciler applies. */
  async block(height: number): Promise<ChainBlock> {
    const raw = await this.rpc<{ height: number; txs: L1Tx[] }>("zendo_getBlockByHeight", [height]);
    const txs = (raw.txs || []).map((tx) => {
      const data = tx.data ?? "";
      return {
        id: txId({ ...tx, data }),
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        fee: tx.fee,
        data,
      };
    });
    return { height: raw.height, txs };
  }

  /** The chain surface the read-model reconciler consumes. */
  reconcileSource(): ChainSource {
    return {
      finalized: () => this.finalized(),
      block: (height) => this.block(height),
      balance: (address) => this.balance(address),
    };
  }

  finalized(): Promise<number> {
    return this.rpc("zendo_finalized", []);
  }

  async waitForReceipt(id: string, options: { timeoutMs?: number; pollMs?: number } = {}): Promise<Receipt> {
    const deadline = Date.now() + (options.timeoutMs ?? 15_000);
    const pollMs = options.pollMs ?? 400;
    for (;;) {
      const receipt = await this.receipt(id);
      if (receipt.height !== null) return receipt;
      if (Date.now() > deadline) throw new Error(`L1 transaction ${id} was not included before the deadline.`);
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
