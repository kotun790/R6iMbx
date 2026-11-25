import { prisma } from "../src/lib/prisma";
import { hash } from "bcryptjs";
import { Prisma } from "../src/generated/prisma/client";

async function main() {
  const defaultPasswordHash = await hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: { role: "ADMIN", status: "ACTIVE" },
    create: {
      username: "admin",
      passwordHash: defaultPasswordHash,
      role: "ADMIN",
      status: "ACTIVE",
      wallet: { create: { currency: "THB" } }
    },
    select: { id: true, username: true }
  });

  await prisma.wallet.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, currency: "THB" }
  });

  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      selfServiceDepositEnabled: true,
      selfServiceWithdrawEnabled: true,
      maintenanceMode: false,
      agentContactLink: "https://t.me/your_support"
    }
  });

  const gameDefaults = [
    { gameKey: "jade-reels", name: "Jade Reels", rtpPercent: "96.50", isEnabled: true, minBet: "1.00", maxBet: "1000.00" },
    { gameKey: "jade-dice", name: "Jade Dice", rtpPercent: "96.50", isEnabled: false, minBet: "1.00", maxBet: "1000.00" },
    { gameKey: "jade-flight", name: "Jade Flight", rtpPercent: "96.50", isEnabled: false, minBet: "1.00", maxBet: "1000.00" }
  ];
  for (const game of gameDefaults) {
    await prisma.gameConfig.upsert({
      where: { gameKey: game.gameKey },
      update: {},
      create: {
        ...game,
        rtpPercent: new Prisma.Decimal(game.rtpPercent),
        minBet: new Prisma.Decimal(game.minBet),
        maxBet: new Prisma.Decimal(game.maxBet)
      }
    });
  }
  console.log(`Seeded admin account: ${admin.username}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
