import { readSession, requireUser } from "@/lib/auth";
import { applyGrant, grants } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";

export async function GET() {
  try {
    const session = await readSession();
    return Response.json(await grants(session?.sub ?? null));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    return Response.json(await applyGrant(user.id, await readBody(req)));
  } catch (error) {
    return fail(error);
  }
}
