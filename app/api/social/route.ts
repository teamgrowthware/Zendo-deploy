import { currentUser, requireUser } from "@/lib/auth";
import {
  createCircle,
  followAccount,
  publishPost,
  publishStory,
  publishVideo,
  sendDirect,
  socialAnalytics,
  socialFeed,
  socialInbox,
  socialProfile,
  unfollowAccount,
} from "@/lib/engine";
import { fail, readBody, ZendoError } from "@/lib/errors";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "feed";
  try {
    const user = await currentUser();
    if (view === "profile") return Response.json(await socialProfile(url.searchParams.get("id") || "", user?.id ?? null));
    if (view === "feed") return Response.json(await socialFeed(user?.id ?? null));
    if (!user) throw new ZendoError("Sign in to continue.", 401);
    if (view === "inbox") return Response.json(await socialInbox(user.id));
    if (view === "analytics") return Response.json(await socialAnalytics(user.id));
    throw new ZendoError("Unknown social view.", 404);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req);
    const action = body.action;
    if (action === "follow") return Response.json(await followAccount(user.id, String(body.id || "")));
    if (action === "unfollow") return Response.json(await unfollowAccount(user.id, String(body.id || "")));
    if (action === "post") return Response.json(await publishPost(user.id, body.body));
    if (action === "story") return Response.json(await publishStory(user.id, body.caption));
    if (action === "video") return Response.json(await publishVideo(user.id, body.title, body.caption));
    if (action === "circle") return Response.json(await createCircle(user.id, body.name, body.memberIds));
    if (action === "message") return Response.json(await sendDirect(user.id, String(body.id || ""), body.body));
    throw new ZendoError("Unknown social action.", 404);
  } catch (error) {
    return fail(error);
  }
}
