import { requireUser } from "@/lib/auth";
import { send } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";
import { transfer, zToUnits } from "@/lib/l1/index";
import { settleRoute } from "@/lib/l1/settle-route";

export const dynamic = "force-dynamic";

/**
 * Native transfers settle on zendo-1. The client signs the transaction with its own recovery-phrase
 * key and posts it as `tx`; the server verifies and relays it, then mirrors the confirmed result into
 * the read model. Nothing is reported as sent until the chain finalizes it.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    const to = String(body.to ?? "");
    const amount = String(body.amount ?? "");
    const token = body.token === undefined ? "ZCOIN" : String(body.token);
    const settled = await settleRoute({
      userId: user.id,
      tx: body.tx,
      build: () => transfer(to, zToUnits(amount)),
      mirror: () => send(user.id, to, token, amount),
    });
    return Response.json({ ok: true, id: settled.id, height: settled.height, finalized: settled.finalized, mirrored: settled.mirrored });
  } catch (error) {
    return fail(error);
  }
}
