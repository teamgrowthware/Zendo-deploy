import { cacheStreamAdd } from "./cache";

export type QueuedJob = { kind: string; body: string; at: number };

const local: QueuedJob[] = [];

/**
 * Background work rides a Redis stream when ZENDO_REDIS_URL is set.
 * With no Redis, the job stays on this process and the HTTP handler does not wait on it.
 * The ledger commit itself still finishes before the response.
 */
export async function publishJob(kind: string, fields: Record<string, string> = {}): Promise<string> {
  const body = JSON.stringify(fields);
  try {
    const id = await cacheStreamAdd("zendo:jobs", { kind, body, at: String(Date.now()) });
    if (id) return id;
  } catch {
    /* fall through to the local list */
  }
  local.push({ kind, body, at: Date.now() });
  if (local.length > 1000) local.shift();
  return "local";
}

export function pendingJobs(): QueuedJob[] {
  return local.slice();
}
