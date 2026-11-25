import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { assertSessionConfiguration, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { isBcryptPasswordLengthValid, registerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details." }, { status: 400 });
  }
  if (!isBcryptPasswordLengthValid(parsed.data.password)) {
    return NextResponse.json({ error: "Password must be no more than 72 UTF-8 bytes." }, { status: 400 });
  }

  try {
    assertSessionConfiguration();
    const username = parsed.data.username.toLowerCase();
    const passwordHash = await hash(parsed.data.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      await tx.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
      return tx.user.create({
        data: {
          username,
          passwordHash,
          role: "PLAYER",
          lastLoginAt: new Date(),
          wallet: { create: { currency: "THB" } }
        },
        select: { id: true, username: true }
      });
    });

    const token = await createSessionToken(user.id);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    console.error("Registration failed:", error);
    return NextResponse.json({ error: "Registration could not be completed. Check the server configuration and try again." }, { status: 500 });
  }
}
