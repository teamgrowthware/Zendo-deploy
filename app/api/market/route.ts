import { readSession, requireUser } from "@/lib/auth";
import { applyReferral, market, publishListing } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";

export async function GET() {
  try {
    const session = await readSession();
    return Response.json(await market(session?.sub ?? null));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    if (body.action === "referral") return Response.json(await applyReferral(user.id, body.code));
    return Response.json(await publishListing(user.id, body));
  } catch (error) {
    return fail(error);
  }
}
