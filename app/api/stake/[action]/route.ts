import { readSession, requireUser } from "@/lib/auth";
import { claim, delegate, staking, undelegate } from "@/lib/engine";
import { fail, readBody, ZendoError } from "@/lib/errors";
import { delegate as delegateL1, undelegate as undelegateL1, zToUnits } from "@/lib/l1/index";
import { settleRoute } from "@/lib/l1/settle-route";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    if (action !== "view") throw new ZendoError("Not found.", 404);
    const session = await readSession();
    return Response.json(await staking(session?.sub ?? null));
  } catch (error) {
    return fail(error);
  }
}

/**
 * Delegation and undelegation are L1 state changes against the staking account. Rewards are paid only
 * from the existing pool, never minted. The client signs; the server relays and mirrors.
 */
export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    const user = await requireUser();
    const body = await readBody(req);
    if (action === "delegate") {
      const index = Number(body.validatorId);
      const amount = String(body.amount ?? "");
      const settled = await settleRoute({
        userId: user.id,
        tx: body.tx,
        build: () => delegateL1(Number.isFinite(index) ? index : 0, zToUnits(amount)),
        mirror: () => delegate(user.id, body.validatorId, body.amount),
      });
      return Response.json({ ok: true, id: settled.id, height: settled.height, finalized: settled.finalized, mirrored: settled.mirrored });
    }
    if (action === "undelegate") {
      const index = Number(body.stakeId);
      const amount = String(body.amount ?? "");
      const settled = await settleRoute({
        userId: user.id,
        tx: body.tx,
        build: () => undelegateL1(Number.isFinite(index) ? index : 0, zToUnits(amount)),
        mirror: () => undelegate(user.id, body.stakeId, body.amount),
      });
      return Response.json({ ok: true, id: settled.id, height: settled.height, finalized: settled.finalized, mirrored: settled.mirrored });
    }
    if (action === "claim") return Response.json(await claim(user.id, body.stakeId ?? "all"));
    throw new ZendoError("Not found.", 404);
  } catch (error) {
    return fail(error);
  }
}
