import { address, block, transaction } from "@/lib/engine";
import { fail, ZendoError } from "@/lib/errors";

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await ctx.params;
  try {
    if (kind === "block") return Response.json(await block(Number(id)));
    if (kind === "tx") return Response.json(await transaction(decodeURIComponent(id)));
    if (kind === "address") return Response.json(await address(decodeURIComponent(id)));
    throw new ZendoError("Not found.", 404);
  } catch (error) {
    return fail(error);
  }
}
