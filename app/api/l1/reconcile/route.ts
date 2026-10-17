import { requireUser } from "@/lib/auth";
import { reconcileFromL1, reconcileStatus } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await reconcileStatus(user.id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    const report = await reconcileFromL1(user.id, { rebuild: body.rebuild === true });
    return Response.json({ ok: true, report });
  } catch (error) {
    return fail(error);
  }
}
