import { requireUser } from "@/lib/auth";
import { externalCatalog, observeExternal, registerExternal } from "@/lib/engine";
import { fail, readBody, ZendoError } from "@/lib/errors";
import type { Observation } from "@/lib/external";

export async function GET() {
  try {
    return Response.json(await externalCatalog());
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    if (body.action === "register") return Response.json(await registerExternal(user.id, body.asset && typeof body.asset === "object" ? (body.asset as Record<string, unknown>) : body));
    if (body.action === "observe") {
      if (!Array.isArray(body.observations)) throw new ZendoError("Observations must be a list.", 400);
      return Response.json(await observeExternal(user.id, body.observations as Observation[]));
    }
    throw new ZendoError("Unknown external action.");
  } catch (error) {
    return fail(error);
  }
}
