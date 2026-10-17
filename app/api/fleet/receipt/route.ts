import { ingestShardReceipt } from "@/lib/engine";
import { fail } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    return Response.json(await ingestShardReceipt(await req.json()));
  } catch (error) {
    return fail(error);
  }
}
