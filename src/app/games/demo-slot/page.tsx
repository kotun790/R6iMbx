import { redirect } from "next/navigation";
import { DemoSlot } from "@/components/demo-slot";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DemoSlotPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "PLAYER") redirect("/");
  const [settings, config] = await Promise.all([
    prisma.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.gameConfig.findUnique({ where: { gameKey: "jade-reels" } })
  ]);
  return <DemoSlot username={user.username} balance={user.wallet?.balance.toFixed(2) ?? "0.00"} currency={user.wallet?.currency ?? "THB"} maintenanceMode={settings.maintenanceMode} gameEnabled={config?.isEnabled ?? false} rtpPercent={config?.rtpPercent.toFixed(2) ?? "—"} minBet={config?.minBet.toFixed(2) ?? "1.00"} maxBet={config?.maxBet.toFixed(2) ?? "1000.00"} />;
}
