import { requireUser } from "@/lib/auth";
import { claimVesting, zcoin } from "@/lib/engine";
import { fail } from "@/lib/errors";

export async function GET() {
  try {
    return Response.json(await zcoin());
  } catch (error) {
    return fail(error);
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    return Response.json(await claimVesting(user.id));
  } catch (error) {
    return fail(error);
  }
}
