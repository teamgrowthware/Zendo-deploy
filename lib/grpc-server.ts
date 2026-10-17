import path from "path";
import { loadPackageDefinition, Server, ServerCredentials, type ServiceDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

let started = false;

type StatusReply = { network_id: string; height: number };

export async function startGrpc() {
  const raw = (process.env.ZENDO_GRPC_PORT || "").trim();
  if (!raw || started) return;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  started = true;
  try {
    const definition = loadSync(path.join(process.cwd(), "proto/zendo.proto"), {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const loaded = loadPackageDefinition(definition) as unknown as {
      zendo: { Chain: { service: ServiceDefinition } };
    };
    const server = new Server();
    server.addService(loaded.zendo.Chain.service, {
      Status: (_call: unknown, callback: (error: Error | null, response?: StatusReply) => void) => {
        void (async () => {
          try {
            const { status } = await import("./engine");
            const chain = await status();
            callback(null, { network_id: chain.networkId, height: chain.height });
          } catch (error) {
            callback(error instanceof Error ? error : new Error("status failed"));
          }
        })();
      },
    });
    await new Promise<void>((resolve, reject) => {
      server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createInsecure(), (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } catch (error) {
    started = false;
    console.error("gRPC did not start.", error);
  }
}
