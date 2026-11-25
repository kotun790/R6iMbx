import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { assertSessionConfiguration, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { isBcryptPasswordLengthValid, loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid username and password." }, { status: 400 });
  }
  const { username, password } = parsed.data;
  if (!isBcryptPasswordLengthValid(password)) {
    return NextResponse.json({ error: "Enter a valid username and password." }, { status: 400 });
  }

  try {
    assertSessionConfiguration();
    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    const passwordMatches = user ? await compare(password, user.passwordHash) : false;
    if (!user || user.status !== "ACTIVE" || !passwordMatches) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const activity = await prisma.user.updateMany({ where: { id: user.id, status: "ACTIVE", sessionVersion: user.sessionVersion }, data: { lastLoginAt: new Date() } });
    if (activity.count !== 1) return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    const token = await createSessionToken(user.id, user.sessionVersion);
    const response = NextResponse.json({ user: { id: user.id, username: user.username, role: user.role } });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 500 });
  }
}
