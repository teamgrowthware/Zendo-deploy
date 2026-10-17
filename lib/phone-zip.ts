import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { join } from "node:path";

const FILES = new Set(["ZendoL-1_App.zip", "ZendoDeployL1.zip", "ZendoCoin-Polygon_Mainnet.zip"]);

function fileName(request?: Request) {
  const header = request?.headers.get("x-zendo-file") || "";
  if (FILES.has(header)) return header;
  if (request) {
    const pathName = new URL(request.url).pathname.split("/").pop() || "";
    if (FILES.has(pathName)) return pathName;
  }
  const asked = request ? new URL(request.url).searchParams.get("file") : "";
  if (asked && FILES.has(asked)) return asked;
  return "ZendoL-1_App.zip";
}

function webStream(path: string, start?: number, end?: number) {
  return Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
}

export async function phoneZipResponse(request?: Request) {
  const FILE_NAME = fileName(request);
  const path = join(process.cwd(), "downloads", FILE_NAME);
  let info;
  try {
    info = await stat(path);
  } catch {
    return new Response("The zip is not on this node yet.", { status: 404 });
  }
  const size = info.size;
  const headers = {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename=${FILE_NAME}`,
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
  if (start === 0 && end === size - 1) {
    return new Response(webStream(path), {
      status: 200,
      headers: { ...headers, "Content-Length": String(size) },
    });
  }
  return new Response(webStream(path, start, end), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
