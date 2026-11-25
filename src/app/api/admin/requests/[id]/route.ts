import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { requestDecisionSchema } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = requestDecisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  const { id } = await context.params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.transaction.findUnique({ where: { id } });
      if (!entry || (entry.type !== "DEPOSIT" && entry.type !== "WITHDRAW")) throw new Error("REQUEST_NOT_FOUND");
      if (entry.status !== "PENDING") throw new Error("REQUEST_ALREADY_HANDLED");
      if (parsed.data.action === "REJECT") {
        const changed = await tx.transaction.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", operatorId: auth.user!.id, note: `${entry.note ?? "Wallet request"} — rejected by ${auth.user!.username}.` } });
        if (changed.count !== 1) throw new Error("REQUEST_ALREADY_HANDLED");
        return { status: "REJECTED", balance: null };
      }

      const amount = new Prisma.Decimal(entry.amount);
      let wallet;
      if (entry.type === "DEPOSIT") {
        wallet = await tx.wallet.update({ where: { userId: entry.userId }, data: { balance: { increment: amount } } });
      } else {
        try {
          wallet = await tx.wallet.update({ where: { userId: entry.userId, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new Error("INSUFFICIENT_FUNDS");
          throw error;
        }
      }
      const before = entry.type === "DEPOSIT" ? wallet.balance.sub(amount) : wallet.balance.add(amount);
      const changed = await tx.transaction.updateMany({ where: { id, status: "PENDING" }, data: {
        status: "APPROVED",
        operatorId: auth.user!.id,
        balanceBefore: before,
        balanceAfter: wallet.balance,
        note: `${entry.note ?? "Wallet request"} — approved by ${auth.user!.username}.`
      } });
      if (changed.count !== 1) throw new Error("REQUEST_ALREADY_HANDLED");
      return { status: "APPROVED", balance: wallet.balance.toFixed(2) };
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") return NextResponse.json({ error: "Pending wallet request not found." }, { status: 404 });
    if (error instanceof Error && error.message === "REQUEST_ALREADY_HANDLED") return NextResponse.json({ error: "This request has already been handled." }, { status: 409 });
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") return NextResponse.json({ error: "The player no longer has enough balance to approve this withdrawal." }, { status: 409 });
    console.error("Wallet request decision failed:", error);
    return NextResponse.json({ error: "Could not process this wallet request." }, { status: 500 });
  }
}
