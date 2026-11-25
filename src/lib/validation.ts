import { z } from "zod";

const username = z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, "Use 3–24 letters, numbers, or underscores.");
const password = z.string().min(8).max(72);
const amount = z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, "Use a positive amount with up to 2 decimal places.").refine((value) => Number(value) > 0, "Amount must be greater than zero.");

export const registerSchema = z.object({ username, password });
export const loginSchema = z.object({ username, password });
export const settingsSchema = z.object({
  selfServiceDepositEnabled: z.boolean(),
  selfServiceWithdrawEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
  agentContactLink: z.string().trim().url().max(2048).refine((value) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "Use a secure HTTPS contact URL.")
});
export const walletRequestSchema = z.object({ type: z.enum(["DEPOSIT", "WITHDRAW"]), amount, note: z.string().trim().max(240).optional() });
export const adjustmentSchema = z.object({ username, action: z.enum(["CREDIT", "DEBIT"]), amount, note: z.string().trim().min(3).max(240) });
export const requestDecisionSchema = z.object({ action: z.enum(["APPROVE", "REJECT"]) });
export const demoSlotSchema = z.object({ amount, requestId: z.string().uuid() });
export const gameConfigSchema = z.object({
  rtpPercent: z.string().trim().regex(/^\d{1,2}(?:\.\d{1,2})?$/).refine((value) => Number(value) >= 80 && Number(value) <= 99, "RTP must be between 80% and 99%."),
  isEnabled: z.boolean(),
  minBet: amount,
  maxBet: amount
}).refine((data) => Number(data.minBet) <= Number(data.maxBet), { message: "Maximum bet must be at least the minimum bet.", path: ["maxBet"] });
export const playerStatusSchema = z.object({ status: z.enum(["ACTIVE", "BANNED"]) });
export const passwordResetSchema = z.object({ password });

export function isBcryptPasswordLengthValid(value: string): boolean {
  return new TextEncoder().encode(value).length <= 72;
}
