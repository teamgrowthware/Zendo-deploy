import { requireUser } from "@/lib/auth";
import { historyFor, issueHistoryPass, takeHistoryPass } from "@/lib/engine";
import { fail, readBody, ZendoError } from "@/lib/errors";
import { historyToCsv } from "@/lib/history";

function fileResponse(body: string, name: string, csv: boolean) {
  const bytes = Buffer.from(body);
  const headers = {
    "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename=${name}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private",
    "X-Content-Type-Options": "nosniff",
  };
  return { bytes, headers };
}

export async function GET(request: Request) {
  try {
    const headerName = request.headers.get("x-zendo-file") || "";
    const pass = request.headers.get("x-zendo-pass") || "";
    const url = new URL(request.url);
    const token = pass || url.searchParams.get("pass") || "";
    const ticket = token ? takeHistoryPass(token) : null;
    const user = ticket ? null : await requireUser();
    const userId = ticket?.userId || user?.id;
    if (!userId) throw new ZendoError("Sign in to download history.", 401);
    const csv = headerName.endsWith(".csv") || ticket?.format === "csv" || url.searchParams.get("format") === "csv";
    const name = csv ? "zendo-history.csv" : "zendo-history.json";
    const data = await historyFor(userId);
    const body = csv ? historyToCsv(data) : JSON.stringify(data, null, 2);
    const packed = fileResponse(body, name, csv);
    const size = packed.bytes.length;
    const range = request.headers.get("range");
    if (!range || range === "bytes=0-" || range === `bytes=0-${size - 1}`) {
      return new Response(packed.bytes, {
        status: 200,
        headers: { ...packed.headers, "Content-Length": String(size) },
      });
    }
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(packed.bytes, { status: 200, headers: { ...packed.headers, "Content-Length": String(size) } });
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : size - 1;
    if (start >= size || end < start) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const slice = packed.bytes.subarray(start, Math.min(end, size - 1) + 1);
    return new Response(slice, {
      status: 206,
      headers: {
        ...packed.headers,
        "Content-Length": String(slice.length),
        "Content-Range": `bytes ${start}-${start + slice.length - 1}/${size}`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    return Response.json(await issueHistoryPass(user.id, body.format));
  } catch (error) {
    return fail(error);
  }
}
