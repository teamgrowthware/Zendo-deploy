import { submitContact } from "@/lib/engine";
import { fail, readBody } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    return Response.json(await submitContact(await readBody(req)));
  } catch (error) {
    return fail(error);
  }
}
