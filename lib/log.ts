export function logEvent(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...fields });
  console.error(line);
}
