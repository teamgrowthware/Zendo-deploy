import { requireUser } from "@/lib/auth";
import { coins, createCoin } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";
import { CREATE_FEE_UNITS, L1Client, launchCreate } from "@/lib/l1/index";
import { settleRoute } from "@/lib/l1/settle-route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    return Response.json(await coins(url.searchParams.get("sort") || "trending", url.searchParams.get("q") || ""));
  } catch (error) {
    return fail(error);
  }
}

/**
 * A launchpad create is an L1 state change: it charges the flat 0.2 Z creation fee into the treasury
 * and stores the curve program on the chain. The client signs the deploy transaction; the server
 * relays it and mirrors the confirmed coin into the read model.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    const program = typeof body.program === "string" && body.program ? body.program : null;
    const settled = await settleRoute({
      userId: user.id,
      tx: body.tx,
      fee: 200_000n,
      build: async () => launchCreate(program ?? (await L1Client.fromEnv().launchProgram())),
      mirror: () => createCoin(user.id, body),
    });
    return Response.json({ ok: true, id: settled.id, height: settled.height, finalized: settled.finalized, mirrored: settled.mirrored, fee: CREATE_FEE_UNITS.toString() });
  } catch (error) {
    return fail(error);
  }
}
