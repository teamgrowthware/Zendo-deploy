export function chooseCanonical(local: number, remote: number): {
  keep: "local" | "remote";
  valid: boolean;
  reason: string;
} {
  if (!Number.isInteger(local) || !Number.isInteger(remote) || local < 0 || remote < 0) {
    return { keep: "local", valid: false, reason: "Fork header is malformed." };
  }
  if (remote > local) {
    return { keep: "remote", valid: true, reason: "The remote tip is longer." };
  }
  return { keep: "local", valid: true, reason: "The local tip stays canonical." };
}

export type ChainHeader = { height: number; hash: string; parent: string };

export function selectHeavier(
  local: ChainHeader[],
  remote: ChainHeader[],
  finalityDepth: number,
): { keep: "local" | "remote"; reason: string } {
  if (!linked(local) || !linked(remote)) {
    return { keep: "local", reason: "A header list is not a linked chain." };
  }
  const localTip = local[local.length - 1]?.height ?? 0;
  const remoteTip = remote[remote.length - 1]?.height ?? 0;
  const finalized = Math.max(0, localTip - Math.max(0, finalityDepth));
  let shared = 0;
  while (shared < local.length && shared < remote.length && local[shared].hash === remote[shared].hash) shared += 1;
  if (shared === 0) return { keep: "local", reason: "The chains do not share a genesis block." };
  if (remoteTip <= localTip) return { keep: "local", reason: "The local tip is at least as long." };
  if (local[shared - 1].height < finalized) return { keep: "local", reason: "The fork point is already finalized." };
  return { keep: "remote", reason: "The remote chain is longer and the fork point is not finalized." };
}

function linked(chain: ChainHeader[]): boolean {
  if (!chain.length) return false;
  for (let i = 1; i < chain.length; i += 1) {
    if (chain[i].parent !== chain[i - 1].hash) return false;
    if (chain[i].height !== chain[i - 1].height + 1) return false;
  }
  return true;
}

export function validateLinkedBlock(
  block: { height: number; parent: string; at: number; hash: string },
  parent: { height: number; hash: string; at: number },
): string | null {
  if (!Number.isInteger(block.height) || block.height !== parent.height + 1) return "malformed height";
  if (block.parent !== parent.hash) return "parent mismatch";
  if (!/^0x[0-9a-f]{64}$/.test(block.hash)) return "bad hash";
  if (block.at < parent.at) return "time went backwards";
  return null;
}
