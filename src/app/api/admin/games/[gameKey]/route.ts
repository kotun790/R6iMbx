import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { gameConfigSchema } from "@/lib/validation";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ gameKey: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = gameConfigSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid game settings." }, { status: 400 });
  const { gameKey } = await context.params;
  const next = {
    rtpPercent: new Prisma.Decimal(parsed.data.rtpPercent),
    isEnabled: parsed.data.isEnabled,
    minBet: new Prisma.Decimal(parsed.data.minBet),
    maxBet: new Prisma.Decimal(parsed.data.maxBet)
  };

  try {
    const game = await prisma.$transaction(async (tx) => {
      const current = await tx.gameConfig.findUnique({ where: { gameKey } });
      if (!current) throw new Error("GAME_CONFIG_NOT_FOUND");
      const changes: Array<{ configField: string; oldValue: string; newValue: string }> = [];
      for (const field of ["rtpPercent", "isEnabled", "minBet", "maxBet"] as const) {
        const oldValue = field === "isEnabled" ? String(current[field]) : current[field].toFixed(2);
        const newValue = field === "isEnabled" ? String(next[field]) : next[field].toFixed(2);
        if (oldValue !== newValue) changes.push({ configField: field, oldValue, newValue });
      }
      const updated = await tx.gameConfig.update({ where: { gameKey }, data: next });
      if (changes.length) {
        await tx.gameConfigAudit.createMany({ data: changes.map((change) => ({
          gameKey,
          configField: change.configField,
          oldValue: change.oldValue,
          newValue: change.newValue,
          actorId: auth.user!.id
        })) });
      }
      return updated;
    });
    return NextResponse.json({ game: { ...game, rtpPercent: game.rtpPercent.toFixed(2), minBet: game.minBet.toFixed(2), maxBet: game.maxBet.toFixed(2) } });
  } catch (error) {
    if (error instanceof Error && error.message === "GAME_CONFIG_NOT_FOUND") return NextResponse.json({ error: "Game configuration not found." }, { status: 404 });
    console.error("Game configuration update failed:", error);
    return NextResponse.json({ error: "Could not save game settings." }, { status: 500 });
  }
}
