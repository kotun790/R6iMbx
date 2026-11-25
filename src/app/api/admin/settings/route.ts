import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { settingsSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  try {
    const settings = await prisma.systemSettings.upsert({ where: { id: 1 }, create: { id: 1, ...parsed.data }, update: parsed.data });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Settings update failed:", error);
    return NextResponse.json({ error: "Could not update system settings." }, { status: 500 });
  }
}
