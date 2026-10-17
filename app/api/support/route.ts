import { requireUser } from "@/lib/auth";
import { listTickets, replyTicket, submitTicket } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await listTickets(user.id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    if (body.action === "reply") {
      return Response.json(await replyTicket(user.id, body.id, body.body, body.as));
    }
    return Response.json(await submitTicket(user.id, body));
  } catch (error) {
    return fail(error);
  }
}
