import { requireUser } from "@/lib/auth";
import { payoutGrant, voteGrant } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await readBody(req);
    if (body.action === "pay") return Response.json(await payoutGrant(user.id, id));
    return Response.json(await voteGrant(user.id, id, body.choice));
  } catch (error) {
    return fail(error);
  }
}
