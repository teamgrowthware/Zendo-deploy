import { clearAuth, currentUser, passwordMatches, pinMatches, readPinGate, requireUser, writePinGate, writeSession } from "@/lib/auth";
import { fail, readBody, ZendoError } from "@/lib/errors";
import { callerKey, changePassword, changePin, choosePin, beginSignup, answerSeed, beginSignupClient, commitSignup, beginRecover, finishRecover, clearPinFailure, forgot, rateHitShared, recordPinFailure, recover, resetPassword, sessionUser, userByEmail, userById } from "@/lib/engine";
import { clearSharedPinLock, sharePinFailure, sharedPinLocked } from "@/lib/locks";

function originOf(req: Request) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "127.0.0.1:38471";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export async function GET(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    if (action === "me") {
      const user = await currentUser();
      return Response.json({ user: user ? sessionUser(user) : null });
    }
    if (action === "signout") {
      await clearAuth();
      return Response.redirect(new URL("/", req.url));
    }
    throw new ZendoError("Not found.", 404);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    if (action === "signout") {
      await clearAuth();
      return Response.json({ ok: true });
    }
    const body = await readBody(req);
    if (action === "signup" || action === "signin" || action === "pin" || action === "forgot" || action === "recover" || action === "reset" || action === "signup-start" || action === "commit-seed" || action === "recover-start" || action === "recover-proof") {
      await rateHitShared(`auth:${action}:${callerKey(req)}`, action === "signin" || action === "pin" ? 20 : 8);
    }
    if (action === "signup") return Response.json(await beginSignup(body));
    if (action === "signup-start") return Response.json(await beginSignupClient(body));
    if (action === "commit-seed") return Response.json(await commitSignup(body.pendingId, body));
    if (action === "confirm-seed") return Response.json(await answerSeed(body.pendingId, body.picks));
    if (action === "set-pin") {
      const user = await choosePin(body.pendingId, body.pin);
      await writeSession(user, 1);
      return Response.json({ user });
    }
    if (action === "signin") {
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      const user = await userByEmail(email).catch(() => null);
      if (!user || !passwordMatches(password, user.passwordHash)) {
        throw new ZendoError("Email or password is wrong.", 401);
      }
      if (user.banned) throw new ZendoError("This account is paused.", 403);
      await writePinGate(user.id);
      return Response.json({ needPin: true, displayName: user.displayName });
    }
    if (action === "pin") {
      const userId = await readPinGate();
      if (!userId) throw new ZendoError("Enter your password again.", 401);
      const user = await userById(userId);
      if (!user) throw new ZendoError("Enter your password again.", 401);
      if (user.banned) throw new ZendoError("This account is paused.", 403);
      if (user.pinLockedUntil > Date.now() || (await sharedPinLocked(user.id))) throw new ZendoError("PIN entry is paused for a few minutes.");
      const pin = typeof body.pin === "string" ? body.pin : "";
      if (!pinMatches(pin, user.pinHash)) {
        const status = await recordPinFailure(user.id);
        await sharePinFailure(user.id, status.lockedUntil);
        if (status.lockedUntil > Date.now()) throw new ZendoError("Too many tries. PIN entry is paused for five minutes.");
        throw new ZendoError("That PIN doesn't match.");
      }
      const fresh = await clearPinFailure(user.id);
      await clearSharedPinLock(user.id);
      await writeSession(fresh, user.sessionVersion);
      return Response.json({ user: fresh });
    }
    if (action === "forgot") return Response.json(await forgot(body.email, originOf(req)));
    if (action === "reset") return Response.json(await resetPassword(body.token, body.password));
    if (action === "recover") {
      const result = await recover(body);
      await writeSession(result.user, result.sessionVersion);
      return Response.json({ user: result.user });
    }
    if (action === "recover-start") return Response.json(await beginRecover(body.email));
    if (action === "recover-proof") {
      const result = await finishRecover(body.pendingId, body);
      await writeSession(result.user, result.sessionVersion);
      return Response.json({ user: result.user });
    }
    if (action === "password") {
      const user = await requireUser();
      const result = await changePassword(user.id, body.current, body.next);
      await writeSession(result.user, result.sessionVersion);
      return Response.json({ user: result.user });
    }
    if (action === "pin-change") {
      const user = await requireUser();
      const result = await changePin(user.id, body.current, body.next);
      await writeSession(result.user, result.sessionVersion);
      return Response.json({ user: result.user });
    }
    throw new ZendoError("Not found.", 404);
  } catch (error) {
    return fail(error);
  }
}
