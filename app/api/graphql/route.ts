import { runQuery } from "@/lib/graphql";

export const dynamic = "force-dynamic";

async function answer(query: string) {
  if (!query.trim()) return Response.json({ errors: [{ message: "Send a query." }] }, { status: 400 });
  const result = await runQuery(query);
  return Response.json(result);
}

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("query") || "{ live { chain { networkId height } } }";
  return answer(query);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const query = body && typeof body === "object" && typeof (body as { query?: unknown }).query === "string" ? (body as { query: string }).query : "";
  return answer(query);
}
