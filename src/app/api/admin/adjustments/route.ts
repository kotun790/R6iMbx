import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { adjustmentSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = adjustmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid adjustment." }, { status: 400 });
  const { username, action, note } = parsed.data;
  const amount = new Prisma.Decimal(parsed.data.amount);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const player = await tx.user.findUnique({ where: { username: username.toLowerCase() }, include: { wallet: true } });
      if (!player || player.role !== "PLAYER" || !player.wallet) throw new Error("PLAYER_NOT_FOUND");
      let updated;
      if (action === "CREDIT") {
        updated = await tx.wallet.update({ where: { userId: player.id }, data: { balance: { increment: amount } } });
      } else {
        try {
          updated = await tx.wallet.update({ where: { userId: player.id, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new Error("INSUFFICIENT_FUNDS");
          throw error;
        }
      }
      const before = action === "CREDIT" ? updated.balance.sub(amount) : updated.balance.add(amount);
      await tx.transaction.create({ data: {
        userId: player.id,
        operatorId: auth.user!.id,
        type: "ADJUSTMENT",
        amount: action === "DEBIT" ? amount.negated() : amount,
        balanceBefore: before,
        balanceAfter: updated.balance,
        status: "COMPLETED",
        referenceId: `admin-adjustment:${crypto.randomUUID()}`,
        note: `${action} by ${auth.user!.username}: ${note}`
      } });
      return { username: player.username, balance: updated.balance.toFixed(2), currency: updated.currency };
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_NOT_FOUND") return NextResponse.json({ error: "Registered player not found." }, { status: 404 });
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") return NextResponse.json({ error: "The player wallet does not have enough balance for this debit." }, { status: 409 });
    console.error("Admin adjustment failed:", error);
    return NextResponse.json({ error: "Could not apply the balance adjustment." }, { status: 500 });
  }
}
