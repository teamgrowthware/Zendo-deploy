import { acquireConnection, releaseConnection } from "./connections";

let started = false;

export async function startLiveSocket() {
  const raw = (process.env.ZENDO_WS_PORT || "").trim();
  if (!raw || started) return;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  started = true;
  try {
    const { WebSocketServer } = await import("ws");
    const sockets = new WebSocketServer({ port, maxPayload: 4096 });
    sockets.on("connection", (socket) => {
      if (!acquireConnection()) {
        socket.close(1013, "This gateway is full.");
        return;
      }
      const send = async () => {
        if (socket.readyState !== socket.OPEN) return;
        try {
          const { liveFeed } = await import("./engine");
          socket.send(JSON.stringify(await liveFeed()));
        } catch {
          /* the next tick tries again */
        }
      };
      void send();
      const timer = setInterval(() => void send(), 2000);
      socket.on("close", () => {
        clearInterval(timer);
        releaseConnection();
      });
    });
  } catch (error) {
    started = false;
    console.error("The live socket did not start.", error);
  }
}
