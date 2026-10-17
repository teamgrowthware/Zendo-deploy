import { requireUser } from "@/lib/auth";
import { promote, quote, reply, report, swap, voteCoin } from "@/lib/engine";
import { fail, readBody, ZendoError } from "@/lib/errors";
import { buy, sell, zToUnits } from "@/lib/l1/index";
import { settleRoute } from "@/lib/l1/settle-route";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ mint: string; action: string }> }) {
  const { mint, action } = await ctx.params;
  try {
    const body = await readBody(req);
    if (action === "quote") return Response.json(await quote(mint, body.side, body.amount));
    const user = await requireUser();
    if (action === "trade") {
      const side = String(body.side ?? "");
      const amount = String(body.amount ?? "");
      if (side !== "buy" && side !== "sell") throw new ZendoError("A trade must be a buy or a sell.", 400);
      const settled = await settleRoute({
        userId: user.id,
        tx: body.tx,
        fee: 200_000n,
        build: () => (side === "buy" ? buy(mint, zToUnits(amount)) : sell(mint, BigInt(amount))),
        mirror: () => swap(user.id, mint, side, amount),
      });
      return Response.json({ ok: true, id: settled.id, height: settled.height, finalized: settled.finalized, mirrored: settled.mirrored });
    }
    if (action === "reply") return Response.json(await reply(user.id, mint, body.body));
    if (action === "vote") return Response.json(await voteCoin(user.id, mint, body.direction));
    if (action === "report") return Response.json(await report(user.id, mint, body.reason, body.detail));
    if (action === "promote") return Response.json(await promote(user.id, mint));
    throw new ZendoError("Not found.", 404);
  } catch (error) {
    return fail(error);
  }
}
