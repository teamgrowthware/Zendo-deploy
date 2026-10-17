import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { ZendoError } from "./errors";
import { sessionKey } from "./session-secret";
import type { PublicUser } from "./types";

const SESSION = "zendo_session";
const PIN = "zendo_pin";

export type Session = {
  sub: string;
  email: string;
  role: "user" | "admin";
  address: string;
  sv: number;
};

function cookieBase(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production" || process.env.ZENDO_SECURE_COOKIES === "1" || process.env.ZENDOSECURECOOKIES === "1" || (process.env.ZENDO_PUBLIC_ORIGIN || "").startsWith("https://"),
    maxAge,
  };
}

export async function writeSession(user: PublicUser & { sessionVersion?: number }, sv: number) {
  const token = await new SignJWT({
    purpose: "session",
    email: user.email,
    role: user.role,
    address: user.address,
    sv,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionKey());
  const jar = await cookies();
  jar.set(SESSION, token, cookieBase(60 * 60 * 24 * 7));
  jar.set(PIN, "", cookieBase(0));
}

export async function writePinGate(userId: string) {
  const token = await new SignJWT({ purpose: "pin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(sessionKey());
  const jar = await cookies();
  jar.set(PIN, token, cookieBase(60 * 10));
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    if (payload.purpose !== "session" || typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email: String(payload.email || ""),
      role: payload.role === "admin" ? "admin" : "user",
      address: String(payload.address || ""),
      sv: Number(payload.sv || 0),
    };
  } catch {
    return null;
  }
}

export async function readPinGate(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(PIN)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    if (payload.purpose !== "pin" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function clearAuth() {
  const jar = await cookies();
  jar.set(SESSION, "", cookieBase(0));
  jar.set(PIN, "", cookieBase(0));
}

export async function currentUser() {
  const session = await readSession();
  if (!session) return null;
  const { userById } = await import("./engine");
  const user = await userById(session.sub);
  if (!user || user.sessionVersion !== session.sv || user.banned) return null;
  return user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new ZendoError("Sign in to continue.", 401);
  return user;
}

export function pinMatches(pin: string, hash: string): boolean {
  return /^\d{4}$/.test(pin) && bcrypt.compareSync(pin, hash);
}

export function passwordMatches(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}
