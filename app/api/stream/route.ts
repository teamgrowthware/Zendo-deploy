import { cacheGet, cacheSet } from "@/lib/cache";
import { acquireConnection, releaseConnection } from "@/lib/connections";
import { liveFeed, status } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!acquireConnection()) {
    return new Response("This gateway is at its connection cap. Another instance can take the stream.", { status: 503 });
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseConnection();
  };
  const encoder = new TextEncoder();
  const gate = { closed: false };
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = async () => {
        if (gate.closed) return;
        try {
          const chain = await status();
          const cached = await cacheGet("live-feed");
          const snapshot = cached ? JSON.parse(cached) : await liveFeed();
          if (!cached) await cacheSet("live-feed", JSON.stringify(snapshot), 1);
          controller.enqueue(encoder.encode(`event: block\ndata: ${JSON.stringify(chain)}\n\n`));
          controller.enqueue(encoder.encode(`event: market\ndata: ${JSON.stringify(snapshot)}\n\n`));
        } catch {
          // The next tick can try again. A quiet slot is not a failed stream.
        }
      };
      void send();
      timer = setInterval(() => void send(), 2000);
    },
    cancel() {
      gate.closed = true;
      if (timer) clearInterval(timer);
      release();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
