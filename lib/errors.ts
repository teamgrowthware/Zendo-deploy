import { logEvent } from "./log";

export type FailReason = "user" | "insufficient" | "malformed" | "signature";

export class ZendoError extends Error {
  status: number;
  reason: FailReason;

  constructor(message: string, status = 400, reason: FailReason = "user") {
    super(message);
    this.name = "ZendoError";
    this.status = status;
    this.reason = reason;
  }
}

function safeDiagnostic(error: unknown) {
  const candidate = error instanceof Error ? error.message : "unknown";
  const containsSensitiveValue = /(?:postgres(?:ql)?:\/\/|password|secret|token|authorization|cookie|phrase|private key|\bpin\b)/i.test(candidate);
  const row = error as { code?: unknown; name?: unknown } | null;
  return {
    error_class: typeof row?.name === "string" ? row.name.slice(0, 80) : "unknown",
    error_code: typeof row?.code === "string" || typeof row?.code === "number" ? String(row.code).slice(0, 40) : "unknown",
    error_message: containsSensitiveValue ? "redacted" : candidate.replace(/\s+/g, " ").slice(0, 240),
  };
}

export function fail(error: unknown, operation = "request"): Response {
  if (error instanceof ZendoError) {
    if (error.status >= 500 || error.status === 429) {
      logEvent("request_rejected", { status: error.status, message: error.message });
    }
    return Response.json({ error: error.message }, { status: error.status });
  }
  logEvent("request_failed", { operation, ...safeDiagnostic(error) });
  return Response.json(
    { error: "The node hit an unexpected error. Nothing was charged." },
    { status: 500 },
  );
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ZendoError("Send a JSON object.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ZendoError) throw error;
    throw new ZendoError("The request body is not valid JSON.");
  }
}
