import { redirect } from "next/navigation";
import { LobbyDashboard } from "@/components/lobby-dashboard";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [settings, transactions, reelConfig] = await Promise.all([
    prisma.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.gameConfig.findUnique({ where: { gameKey: "jade-reels" }, select: { isEnabled: true } })
  ]);
  return <LobbyDashboard
    username={user.username}
    role={user.role}
    balance={user.wallet?.balance.toFixed(2) ?? "0.00"}
    currency={user.wallet?.currency ?? "THB"}
    demoSlotEnabled={reelConfig?.isEnabled ?? false}
    settings={{ selfServiceDepositEnabled: settings.selfServiceDepositEnabled, selfServiceWithdrawEnabled: settings.selfServiceWithdrawEnabled, maintenanceMode: settings.maintenanceMode, agentContactLink: settings.agentContactLink }}
    history={transactions.map((item) => ({ id: item.id, type: item.type, amount: item.amount.toFixed(2), status: item.status, note: item.note, createdAt: item.createdAt.toISOString() }))}
  />;
}
