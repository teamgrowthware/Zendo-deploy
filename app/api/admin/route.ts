import { requireUser } from "@/lib/auth";
import { addTicketNote, admin, adminFork, adminHide, adminMev, adminPremium, adminUserBan, adminUserRole, adminValidator, setTicketStatus } from "@/lib/engine";
import { fail, readBody, ZendoError } from "@/lib/errors";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await admin(user.id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    if (body.action === "validator") return Response.json(await adminValidator(user.id, body.id, body.status));
    if (body.action === "hide") return Response.json(await adminHide(user.id, body.mint, body.hidden));
    if (body.action === "mev") return Response.json(await adminMev(user.id, body.enabled));
    if (body.action === "premium") return Response.json(await adminPremium(user.id, body.email, body.premium));
    if (body.action === "fork") return Response.json(await adminFork(user.id, body.remote));
    if (body.action === "role") return Response.json(await adminUserRole(user.id, body.id, body.role));
    if (body.action === "ban") return Response.json(await adminUserBan(user.id, body.id, body.banned));
    if (body.action === "ticket-status") return Response.json(await setTicketStatus(user.id, body.id, body.status));
    if (body.action === "ticket-note") return Response.json(await addTicketNote(user.id, body.id, body.body));
    throw new ZendoError("Unknown admin action.");
  } catch (error) {
    return fail(error);
  }
}
