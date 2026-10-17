import { fail, ZendoError } from "@/lib/errors";
import { blocks, contractList, fees, search, stats, status, suggest, validatorList } from "@/lib/engine";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "status";
  const q = url.searchParams.get("q") || "";
  try {
    if (view === "status") return Response.json(await status());
    if (view === "fees") return Response.json(await fees());
    if (view === "blocks") return Response.json(await blocks(Number(url.searchParams.get("limit") || 20)));
    if (view === "validators") return Response.json(await validatorList());
    if (view === "contracts") return Response.json(await contractList());
    if (view === "stats") return Response.json(await stats());
    if (view === "search") return Response.json(await search(q));
    if (view === "suggest") return Response.json(await suggest(q, url.searchParams.get("kind") || "all", Number(url.searchParams.get("limit") || 8)));
    throw new ZendoError("Unknown chain view.", 404);
  } catch (error) {
    return fail(error);
  }
}
