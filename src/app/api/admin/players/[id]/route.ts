import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { playerStatusSchema } from "@/lib/validation";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = playerStatusSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose Active or Locked." }, { status: 400 });
  const { id } = await context.params;
  try {
    const updated = await prisma.user.updateMany({ where: { id, role: "PLAYER" }, data: { status: parsed.data.status, sessionVersion: { increment: 1 } } });
    if (updated.count !== 1) return NextResponse.json({ error: "Player not found." }, { status: 404 });
    return NextResponse.json({ status: parsed.data.status });
  } catch (error) {
    console.error("Player status update failed:", error);
    return NextResponse.json({ error: "Could not update player status." }, { status: 500 });
  }
}
