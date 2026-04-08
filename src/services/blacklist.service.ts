import { db } from "@/db";
import { blacklist } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { ConflictError } from "./errors";

// ─── Types ──────────────────────────────────────────────────────────

export interface AddBlacklistInput {
  type: "domain" | "email" | "business";
  value: string;
  reason?: string;
}

// ─── Service Functions ──────────────────────────────────────────────

export function listBlacklist() {
  return db.select().from(blacklist).orderBy(desc(blacklist.createdAt)).all();
}

export function addToBlacklist(input: AddBlacklistInput) {
  const normalizedValue = input.value.toLowerCase().trim();

  try {
    const result = db.insert(blacklist).values({
      type: input.type,
      value: normalizedValue,
      reason: input.reason || null,
    }).returning().get();

    logActivity("blacklist", `Añadido a blacklist: ${input.value}`, {
      metadata: { type: input.type, value: input.value },
      messageKey: "activityLog.leadBlacklisted",
      messageVars: { name: input.value },
    });

    return result;
  } catch {
    throw new ConflictError(`Already in blacklist: ${normalizedValue}`);
  }
}

export function removeFromBlacklist(id: number) {
  db.delete(blacklist).where(eq(blacklist.id, id)).run();
  return { success: true };
}
