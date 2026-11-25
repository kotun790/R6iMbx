import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const settings = await prisma.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    return NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role, status: user.status },
      wallet: user.wallet ? { balance: user.wallet.balance.toFixed(2), currency: user.wallet.currency } : null,
      systemSettings: settings
    });
  } catch (error) {
    console.error("Profile lookup failed:", error);
    return NextResponse.json({ error: "Could not load the account profile." }, { status: 500 });
  }
}
