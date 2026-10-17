import { machinesFor, placement } from "@/lib/fleet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const users = Number(url.searchParams.get("users") || "0");
  const tps = Number(url.searchParams.get("tps") || "0");
  const here = placement();
  return Response.json({
    ok: true,
    role: here.role,
    shardIndex: here.index,
    shardCount: here.count,
    follower: here.follower,
    plan: {
      ...machinesFor(users, tps),
      app: "one ledger",
      readers: "replica in each region, every feature",
      writes: "primary, one ordered commit",
    },
  });
}
