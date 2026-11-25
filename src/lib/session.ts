import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "casino_portal_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function signingKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace-with-")) {
    throw new Error("SESSION_SECRET must be a unique random value of at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export function assertSessionConfiguration(): void {
  signingKey();
}

export async function createSessionToken(userId: string, sessionVersion = 0): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setClaim("sv", sessionVersion)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(signingKey());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  };
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        sessionVersion: true,
        wallet: { select: { balance: true, currency: true } }
      }
    });

    const tokenVersion = typeof payload.sv === "number" ? payload.sv : 0;
    if (tokenVersion !== user?.sessionVersion) return null;
    if (!user || user.status !== "ACTIVE") return null;
    return user;
  } catch {
    return null;
  }
}
