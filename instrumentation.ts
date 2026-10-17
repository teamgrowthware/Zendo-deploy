export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGrpc } = await import("./lib/grpc-server");
    const { startLiveSocket } = await import("./lib/ws-server");
    await startGrpc();
    await startLiveSocket();
  }
}
