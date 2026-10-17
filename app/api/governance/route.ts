import { readSession, requireUser } from "@/lib/auth";
import { proposals, propose } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";

export async function GET() {
  try {
    const session = await readSession();
    return Response.json(await proposals(session?.sub ?? null));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    return Response.json(await propose(user.id, body.title, body.body, { key: body.key, value: body.value }));
  } catch (error) {
    return fail(error);
  }
}
