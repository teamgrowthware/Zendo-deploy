import { requireUser } from "@/lib/auth";
import { rateListing } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await readBody(req);
    return Response.json(await rateListing(user.id, id, body.stars));
  } catch (error) {
    return fail(error);
  }
}
