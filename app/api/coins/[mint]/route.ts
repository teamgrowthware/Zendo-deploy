import { readSession } from "@/lib/auth";
import { coin } from "@/lib/engine";
import { fail } from "@/lib/errors";

export async function GET(_req: Request, ctx: { params: Promise<{ mint: string }> }) {
  try {
    const { mint } = await ctx.params;
    const session = await readSession();
    return Response.json(await coin(mint, session?.sub ?? null));
  } catch (error) {
    return fail(error);
  }
}
