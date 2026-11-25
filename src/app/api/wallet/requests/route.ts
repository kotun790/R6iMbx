import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { walletRequestSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = walletRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid wallet request." }, { status: 400 });
  const settings = await prisma.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  if (settings.maintenanceMode) return NextResponse.json({ error: "Wallet services are temporarily unavailable during maintenance." }, { status: 503 });
  if (parsed.data.type === "DEPOSIT" && !settings.selfServiceDepositEnabled) return NextResponse.json({ error: "Self-service deposits are currently disabled." }, { status: 403 });
  if (parsed.data.type === "WITHDRAW" && !settings.selfServiceWithdrawEnabled) return NextResponse.json({ error: "Self-service withdrawals are currently disabled." }, { status: 403 });
  const amount = new Prisma.Decimal(parsed.data.amount);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });
      if (!wallet) throw new Error("WALLET_MISSING");
      return tx.transaction.create({ data: {
        userId: user.id,
        type: parsed.data.type,
        amount,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance,
        status: "PENDING",
        referenceId: `wallet-request:${crypto.randomUUID()}`,
        note: parsed.data.note || `${parsed.data.type === "DEPOSIT" ? "Deposit" : "Withdrawal"} request awaiting administrator review.`
      }, select: { id: true, type: true, amount: true, status: true, createdAt: true } });
    });
    return NextResponse.json({ request: { ...created, amount: created.amount.toFixed(2) } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "WALLET_MISSING") return NextResponse.json({ error: "Wallet not found." }, { status: 409 });
    console.error("Wallet request failed:", error);
    return NextResponse.json({ error: "Could not submit the wallet request." }, { status: 500 });
  }
}
