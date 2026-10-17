/** Cross-origin API calls are allowed only for the single public site origin. */
export function publicOrigins(): string[] {
  const origin = (process.env.ZENDO_PUBLIC_ORIGIN || "").trim().replace(/\/$/, "");
  if (!origin || origin === "*") return [];
  try {
    const url = new URL(origin);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (local && url.protocol === "http:")) return [url.origin];
  } catch {
    return [];
  }
  return [];
}
