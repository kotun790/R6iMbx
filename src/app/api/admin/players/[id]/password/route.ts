import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { isBcryptPasswordLengthValid, passwordResetSchema } from "@/lib/validation";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = passwordResetSchema.safeParse(body);
  if (!parsed.success || !isBcryptPasswordLengthValid(parsed.data.password)) return NextResponse.json({ error: "Password must be 8–72 UTF-8 bytes." }, { status: 400 });
  const { id } = await context.params;
  try {
    const passwordHash = await hash(parsed.data.password, 12);
    const updated = await prisma.user.updateMany({ where: { id, role: "PLAYER" }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    if (updated.count !== 1) return NextResponse.json({ error: "Player not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Player password reset failed:", error);
    return NextResponse.json({ error: "Could not reset the player password." }, { status: 500 });
  }
}
