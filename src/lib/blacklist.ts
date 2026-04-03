import { db } from "@/db";
import { blacklist } from "@/db/schema";

export function isBlacklisted(
  email?: string | null,
  website?: string | null,
  businessName?: string | null
): boolean {
  const entries = db.select().from(blacklist).all();
  const blacklistSet = new Set(entries.map((b) => b.value.toLowerCase()));

  if (email && blacklistSet.has(email.toLowerCase())) return true;

  if (website) {
    try {
      const url = website.startsWith("http") ? website : `https://${website}`;
      const domain = new URL(url).hostname.replace("www.", "");
      if (blacklistSet.has(domain)) return true;
    } catch {
      // invalid URL, skip domain check
    }
  }

  if (businessName && blacklistSet.has(businessName.toLowerCase())) return true;

  return false;
}
