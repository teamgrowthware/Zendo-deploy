import { requireUser } from "@/lib/auth";
import { voteProposal } from "@/lib/engine";
import { fail, readBody, ZendoError } from "@/lib/errors";
import { vote } from "@/lib/l1/index";
import { settleRoute } from "@/lib/l1/settle-route";

export const dynamic = "force-dynamic";

/**
 * A governance vote is an L1 transaction against the proposal's contract. In production the client
 * signs it and the server relays; the DEV fallback can build one when the request names the L1
 * contract and the numeric proposal id.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await readBody(req);
    const choice = body.choice === "yes" ? 1 : 0;
    const settled = await settleRoute({
      userId: user.id,
      tx: body.tx,
      build: () => {
        const contract = typeof body.contract === "string" ? body.contract : "";
        const proposalId = Number(body.proposalId);
        if (!/^[0-9a-fA-F]{40}$/.test(contract) || !Number.isInteger(proposalId) || proposalId < 1) {
          throw new ZendoError("A client-signed governance transaction is required.", 401, "signature");
        }
        return vote(contract, proposalId, choice);
      },
      mirror: () => voteProposal(user.id, id, body.choice),
    });
    return Response.json({ ok: true, id: settled.id, height: settled.height, finalized: settled.finalized, mirrored: settled.mirrored });
  } catch (error) {
    return fail(error);
  }
}
