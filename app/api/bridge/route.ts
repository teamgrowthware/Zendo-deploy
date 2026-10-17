import { requireUser } from "@/lib/auth";
import { bridgeDeposit, bridgeDesk, bridgeSeed, bridgeWithdraw } from "@/lib/engine";
import { fail, readBody, ZendoError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await bridgeDesk(user.id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    if (body.action === "withdraw") return Response.json(await bridgeWithdraw(user.id, body.recipient, body.amount));
    if (body.action === "deposit") return Response.json(await bridgeDeposit(user.id, body.txHash));
    if (body.action === "seed") return Response.json(await bridgeSeed(user.id, body.amount));
    throw new ZendoError("Choose withdraw, deposit, or seed.");
  } catch (error) {
    return fail(error);
  }
}
