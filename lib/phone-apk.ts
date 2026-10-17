import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { join } from "node:path";

const FILE_NAME = "Zendo.apk";

function webStream(path: string, start?: number, end?: number) {
  return Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
}

export async function phoneApkResponse(request?: Request) {
  const path = join(process.cwd(), "public", "downloads", FILE_NAME);
  let info;
  try {
    info = await stat(path);
  } catch {
    return new Response("The Android package is not on this node yet.", { status: 404 });
  }
  const size = info.size;
  const headers = {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": `attachment; filename="${FILE_NAME}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private",
    "X-Content-Type-Options": "nosniff",
  };
  const range = request?.headers.get("range");
  if (!range) {
    return new Response(webStream(path), {
      status: 200,
      headers: { ...headers, "Content-Length": String(size) },
    });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  let start = match[1] === "" ? Number.NaN : Number(match[1]);
  let end = match[2] === "" ? size - 1 : Number(match[2]);
  if (Number.isNaN(start)) {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix)) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isFinite(start) || start < 0 || start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  return new Response(webStream(path, start, end), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
