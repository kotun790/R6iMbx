import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { AdminConsole } from "@/components/admin-console";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
type Search = { period?: string };

function periodStart(period: string): Date | null {
  const now = new Date();
  if (period === "today") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  const query = await searchParams;
  const period = ["today", "7d", "30d", "all"].includes(query.period ?? "") ? query.period! : "7d";
  const from = periodStart(period);
  const dateFilter = from ? { createdAt: { gte: from } } : {};
  const settled = { in: ["APPROVED", "COMPLETED"] as ("APPROVED" | "COMPLETED")[] };
  const [settings, players, requests, ledger, configs, audits, bets, wins, deposits, withdrawals, activePlayers, registeredPlayers] = await Promise.all([
    prisma.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.user.findMany({ where: { role: "PLAYER" }, orderBy: { createdAt: "desc" }, take: 1000, select: { id: true, username: true, displayName: true, contact: true, status: true, createdAt: true, lastLoginAt: true, wallet: { select: { balance: true, currency: true } } } }),
    prisma.transaction.findMany({ where: { type: { in: ["DEPOSIT", "WITHDRAW"] }, status: "PENDING" }, include: { user: { select: { username: true, wallet: { select: { currency: true } } } } }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.transaction.findMany({ where: { type: { in: ["DEPOSIT", "WITHDRAW", "ADJUSTMENT"] }, status: { in: ["APPROVED", "COMPLETED", "REJECTED"] }, ...dateFilter }, include: { user: { select: { id: true, username: true } }, operator: { select: { username: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.gameConfig.findMany({ orderBy: { gameKey: "asc" } }),
    prisma.gameConfigAudit.findMany({ include: { actor: { select: { username: true } } }, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.transaction.aggregate({ where: { type: "BET", status: "COMPLETED", ...dateFilter }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: "WIN", status: "COMPLETED", ...dateFilter }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: "DEPOSIT", status: settled, ...dateFilter }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: "WITHDRAW", status: settled, ...dateFilter }, _sum: { amount: true } }),
    prisma.user.count({ where: { role: "PLAYER", status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "PLAYER" } })
  ]);
  const turnover = (bets._sum.amount ?? new Prisma.Decimal(0)).abs();
  const payouts = wins._sum.amount ?? new Prisma.Decimal(0);
  return <AdminConsole
    username={user.username}
    period={period}
    settings={{ selfServiceDepositEnabled: settings.selfServiceDepositEnabled, selfServiceWithdrawEnabled: settings.selfServiceWithdrawEnabled, maintenanceMode: settings.maintenanceMode, agentContactLink: settings.agentContactLink }}
    summary={{ turnover: turnover.toFixed(2), payouts: payouts.toFixed(2), net: turnover.sub(payouts).toFixed(2), deposits: (deposits._sum.amount ?? new Prisma.Decimal(0)).toFixed(2), withdrawals: (withdrawals._sum.amount ?? new Prisma.Decimal(0)).toFixed(2), activePlayers, registeredPlayers }}
    players={players.map((player) => ({ id: player.id, username: player.username, displayName: player.displayName, contact: player.contact, status: player.status, balance: player.wallet?.balance.toFixed(2) ?? "0.00", currency: player.wallet?.currency ?? "THB", createdAt: player.createdAt.toISOString(), lastActivityAt: player.lastLoginAt?.toISOString() ?? null }))}
    requests={requests.map((item) => ({ id: item.id, username: item.user.username, type: item.type, amount: item.amount.toFixed(2), currency: item.user.wallet?.currency ?? "THB", note: item.note, createdAt: item.createdAt.toISOString() }))}
    ledger={ledger.map((item) => ({ id: item.id, username: item.user.username, userId: item.user.id, type: item.type, amount: item.amount.toFixed(2), balanceBefore: item.balanceBefore.toFixed(2), balanceAfter: item.balanceAfter.toFixed(2), status: item.status, note: item.note, operator: item.operator?.username ?? "System", createdAt: item.createdAt.toISOString() }))}
    games={configs.map((game) => ({ gameKey: game.gameKey, name: game.name, rtpPercent: game.rtpPercent.toFixed(2), isEnabled: game.isEnabled, minBet: game.minBet.toFixed(2), maxBet: game.maxBet.toFixed(2) }))}
    gameAudits={audits.map((audit) => ({ id: audit.id, gameKey: audit.gameKey, configField: audit.configField, oldValue: audit.oldValue, newValue: audit.newValue, actor: audit.actor.username, createdAt: audit.createdAt.toISOString() }))}
  />;
}
