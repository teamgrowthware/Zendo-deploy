import { CONNECTIONS_PER_GATEWAY } from "./fleet";

let open = 0;

export function connectionCap(): number {
  const raw = Number(process.env.ZENDO_CONNECTION_CAP);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return CONNECTIONS_PER_GATEWAY;
}

export function openConnections(): number {
  return open;
}

/** One process holds this many streams. Millions of clients means more gateway processes. */
export function acquireConnection(): boolean {
  if (open >= connectionCap()) return false;
  open += 1;
  return true;
}

export function releaseConnection() {
  if (open > 0) open -= 1;
}
