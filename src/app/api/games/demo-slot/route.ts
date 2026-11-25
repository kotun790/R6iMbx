import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { demoSlotSchema } from "@/lib/validation";

export const runtime = "nodejs";
const SYMBOLS = ["CROWN", "ORCHID", "JADE", "COIN", "MOON"] as const;
const ZERO_CENTS = BigInt(0);
const ONE_HUNDRED = BigInt(100);
const centsFrom = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * ONE_HUNDRED + BigInt(fraction.padEnd(2, "0"));
};
const amountFromCents = (value: bigint) => `${value / ONE_HUNDRED}.${(value % ONE_HUNDRED).toString().padStart(2, "0")}`;

function decodeRound(note: string | null, amount: string, balance: string) {
  try {
    const info = JSON.parse(note ?? "{}") as { symbols?: string[]; payout?: string; balance?: string; outcome?: string; rtpPercent?: string };
    return { symbols: info.symbols ?? [], payout: info.payout ?? "0.00", balance: info.balance ?? balance, outcome: info.outcome ?? "Round already played.", rtpPercent: info.rtpPercent ?? "96.50", bet: amount };
  } catch {
    return { symbols: [], payout: "0.00", balance, outcome: "Round already played.", rtpPercent: "96.50", bet: amount };
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "PLAYER") return NextResponse.json({ error: "Player account required." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = demoSlotSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid bet." }, { status: 400 });
  const [settings, gameConfig] = await Promise.all([
    prisma.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.gameConfig.findUnique({ where: { gameKey: "jade-reels" } })
  ]);
  if (settings.maintenanceMode) return NextResponse.json({ error: "Games are temporarily unavailable during maintenance." }, { status: 503 });
  if (!gameConfig) return NextResponse.json({ error: "Jade Reels is not configured. Run the seed script after applying the schema." }, { status: 503 });
  if (!gameConfig.isEnabled) return NextResponse.json({ error: "Jade Reels is currently disabled." }, { status: 403 });

  const amount = new Prisma.Decimal(parsed.data.amount);
  if (amount.lessThan(gameConfig.minBet) || amount.greaterThan(gameConfig.maxBet)) {
    return NextResponse.json({ error: `Bet must be between THB ${gameConfig.minBet.toFixed(2)} and THB ${gameConfig.maxBet.toFixed(2)}.` }, { status: 400 });
  }
  const referenceId = `demo-slot:${user.id}:${parsed.data.requestId}`;
  const existing = await prisma.transaction.findUnique({ where: { referenceId } });
  if (existing) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    return NextResponse.json({ round: decodeRound(existing.note, existing.amount.abs().toFixed(2), wallet?.balance.toFixed(2) ?? "0.00"), replayed: true });
  }

  const roll = randomInt(100);
  let symbols: string[];
  let payoutMultiplier = 0;
  if (roll < 7) {
    const symbol = SYMBOLS[randomInt(SYMBOLS.length)];
    symbols = [symbol, symbol, symbol];
    payoutMultiplier = 8;
  } else if (roll < 27) {
    const symbol = SYMBOLS[randomInt(SYMBOLS.length)];
    let different = SYMBOLS[randomInt(SYMBOLS.length)];
    while (different === symbol) different = SYMBOLS[randomInt(SYMBOLS.length)];
    symbols = randomInt(3) === 0 ? [different, symbol, symbol] : randomInt(2) === 0 ? [symbol, different, symbol] : [symbol, symbol, different];
    payoutMultiplier = 1.5;
  } else {
    const shuffled = [...SYMBOLS];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = randomInt(index + 1);
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    symbols = shuffled.slice(0, 3);
  }
  const betCents = centsFrom(parsed.data.amount);
  const rtpBasisPoints = BigInt(gameConfig.rtpPercent.mul(100).toFixed(0));
  const baselineRtpBasisPoints = BigInt(8600);
  const payoutCents = payoutMultiplier === 8
    ? betCents * BigInt(8) * rtpBasisPoints / baselineRtpBasisPoints
    : payoutMultiplier === 1.5
      ? betCents * BigInt(3) * rtpBasisPoints / (BigInt(2) * baselineRtpBasisPoints)
      : ZERO_CENTS;
  const payout = new Prisma.Decimal(amountFromCents(payoutCents));
  const configuredRtp = gameConfig.rtpPercent.toFixed(2);
  const actualMultiplier = payoutCents > ZERO_CENTS ? payout.div(amount).toFixed(2) : "0.00";
  const outcome = payoutCents > ZERO_CENTS ? `${payoutMultiplier === 8 ? "Three of a kind" : "Two matching symbols"} — ${actualMultiplier}× payout at configured ${configuredRtp}% RTP.` : "No match this round.";

  try {
    const round = await prisma.$transaction(async (tx) => {
      let afterBet;
      try {
        afterBet = await tx.wallet.update({ where: { userId: user.id, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new Error("INSUFFICIENT_FUNDS");
        throw error;
      }
      const betEntry = await tx.transaction.create({ data: {
        userId: user.id, type: "BET", amount: amount.negated(), balanceBefore: afterBet.balance.add(amount), balanceAfter: afterBet.balance,
        status: "COMPLETED", referenceId, note: "Demo slot bet."
      } });
      let finalBalance = afterBet.balance;
      if (payoutCents > ZERO_CENTS) {
        const afterWin = await tx.wallet.update({ where: { userId: user.id }, data: { balance: { increment: payout } } });
        finalBalance = afterWin.balance;
        await tx.transaction.create({ data: {
          userId: user.id, type: "WIN", amount: payout, balanceBefore: afterWin.balance.sub(payout), balanceAfter: afterWin.balance,
          status: "COMPLETED", referenceId: `demo-slot-win:${user.id}:${parsed.data.requestId}`, note: `Demo slot payout (${actualMultiplier}×; configured RTP ${configuredRtp}%).`
        } });
      }
      const detail = JSON.stringify({ symbols, payout: payout.toFixed(2), balance: finalBalance.toFixed(2), outcome, rtpPercent: configuredRtp });
      await tx.transaction.update({ where: { id: betEntry.id }, data: { note: detail } });
      return { symbols, payout: payout.toFixed(2), balance: finalBalance.toFixed(2), outcome, rtpPercent: configuredRtp, bet: amount.toFixed(2) };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ round, replayed: false });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") return NextResponse.json({ error: "Insufficient wallet balance for this bet." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.transaction.findUnique({ where: { referenceId } });
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      if (duplicate) return NextResponse.json({ round: decodeRound(duplicate.note, duplicate.amount.abs().toFixed(2), wallet?.balance.toFixed(2) ?? "0.00"), replayed: true });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      const duplicate = await prisma.transaction.findUnique({ where: { referenceId } });
      if (duplicate) {
        const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
        return NextResponse.json({ round: decodeRound(duplicate.note, duplicate.amount.abs().toFixed(2), wallet?.balance.toFixed(2) ?? "0.00"), replayed: true });
      }
      return NextResponse.json({ error: "Wallet was updated at the same time. Please retry the round." }, { status: 409 });
    }
    console.error("Demo slot round failed:", error);
    return NextResponse.json({ error: "Could not complete the demo slot round." }, { status: 500 });
  }
}
