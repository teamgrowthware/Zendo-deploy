import { STAKE_ADDRESS, stakePayload } from "./tx";
import { CREATE_FEE_UNITS, LAUNCH_MARKER } from "./units";

export const ZERO_ADDRESS = "0".repeat(40);

/** The wire shape accepted by `signTx`. Amounts are base units. */
export type TxInput = { to: string; amount: bigint; data?: Buffer };

function word(value: bigint | number | string): Buffer {
  const bi = typeof value === "bigint" ? value : BigInt(value);
  if (bi < 0n || bi >= 1n << 256n) throw new Error("a calldata word must fit in 32 bytes");
  const out = Buffer.alloc(32);
  let rest = bi;
  for (let i = 31; i >= 0 && rest > 0n; i--) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

/** A plain native transfer. */
export function transfer(to: string, amount: bigint | string): TxInput {
  return { to, amount: typeof amount === "bigint" ? amount : BigInt(amount) };
}

/**
 * Deploys a launchpad coin. The payload is the launch marker followed by the curve program the node
 * serves from `zendo_launchProgram`. The flat creation fee rides on the amount and lands on the
 * treasury, and the new contract starts empty.
 */
export function launchCreate(programHex: string): TxInput {
  const program = programHex.trim().replace(/^0x/, "");
  if (!/^([0-9a-fA-F]{2})+$/.test(program)) throw new Error("the launch program must be hexadecimal bytecode");
  const marker = Buffer.alloc(1, LAUNCH_MARKER);
  return { to: ZERO_ADDRESS, amount: CREATE_FEE_UNITS, data: Buffer.concat([marker, Buffer.from(program, "hex")]) };
}

/** Buys a launchpad coin. The paid Z rides on the amount and the selector is word zero. */
export function buy(coin: string, amountUnits: bigint): TxInput {
  return { to: coin, amount: amountUnits, data: word(1) };
}

/** Sells launchpad tokens. The token amount is the argument at byte offset 32. */
export function sell(coin: string, tokens: bigint): TxInput {
  return { to: coin, amount: 0n, data: Buffer.concat([word(2), word(tokens)]) };
}

/** Bonds Z to a validator. */
export function delegate(validatorIndex: number, amountUnits: bigint): TxInput {
  return { to: STAKE_ADDRESS, amount: amountUnits, data: stakePayload(1, validatorIndex) };
}

/** Withdraws a bond from a validator. */
export function undelegate(validatorIndex: number, amountUnits: bigint): TxInput {
  return { to: STAKE_ADDRESS, amount: amountUnits, data: stakePayload(2, validatorIndex) };
}

/** Opens a governance proposal. Only the selector is needed; the contract assigns the id. */
export function propose(contract: string): TxInput {
  return { to: contract, amount: 0n, data: word(1) };
}

/** Votes on a proposal. Choice `1` is yes and every other value is no. */
export function vote(contract: string, proposalId: number | bigint, choice: 1 | 0): TxInput {
  return { to: contract, amount: 0n, data: Buffer.concat([word(2), word(proposalId), word(choice)]) };
}

/**
 * Deploys a plain contract (for example the governance program) with no launch marker and no fee.
 * The node derives the address from the sender and the current nonce.
 */
export function deploy(codeHex: string): TxInput {
  const code = codeHex.trim().replace(/^0x/, "");
  if (!/^([0-9a-fA-F]{2})+$/.test(code)) throw new Error("the program must be hexadecimal bytecode");
  return { to: ZERO_ADDRESS, amount: 0n, data: Buffer.from(code, "hex") };
}
