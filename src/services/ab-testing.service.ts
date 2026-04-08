import { db } from "@/db";
import { abVariants, abResults, campaigns } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { sqlite } from "@/db/connection";

interface VariantResults {
  total: number;
  opens: number;
  clicks: number;
  replies: number;
}

interface WAVariantResults {
  total: number;
  replies: number;
}

function getVariantResults(variantId: number, group: "A" | "B"): VariantResults {
  const r = db.select({
    total: sql<number>`count(*)`,
    opens: sql<number>`sum(${abResults.opened})`,
    clicks: sql<number>`sum(${abResults.clicked})`,
    replies: sql<number>`sum(${abResults.replied})`,
  }).from(abResults)
    .where(and(eq(abResults.variantId, variantId), eq(abResults.variantGroup, group)))
    .get();
  return { total: r?.total ?? 0, opens: r?.opens ?? 0, clicks: r?.clicks ?? 0, replies: r?.replies ?? 0 };
}

function getWAVariantResults(variantId: number, group: "A" | "B"): WAVariantResults {
  const r = db.select({
    total: sql<number>`count(*)`,
    replies: sql<number>`coalesce(sum(${abResults.replied}), 0)`,
  }).from(abResults)
    .where(and(
      eq(abResults.variantId, variantId),
      eq(abResults.variantGroup, group),
      sql`${abResults.whatsappMessageId} IS NOT NULL`
    )).get();
  return { total: r?.total ?? 0, replies: r?.replies ?? 0 };
}

export function listABTests() {
  const tests = db.select({
    test: abVariants,
    campaignName: campaigns.name,
  }).from(abVariants)
    .leftJoin(campaigns, eq(abVariants.campaignId, campaigns.id))
    .all();

  return tests.map(({ test, campaignName }) => ({
    ...test,
    campaignName,
    variantAConfig: JSON.parse(test.variantA),
    variantBConfig: JSON.parse(test.variantB),
    resultsA: getVariantResults(test.id, "A"),
    resultsB: getVariantResults(test.id, "B"),
    waResultsA: getWAVariantResults(test.id, "A"),
    waResultsB: getWAVariantResults(test.id, "B"),
  }));
}

export function createABTest(input: {
  campaignId?: number;
  name: string;
  variantA: object;
  variantB: object;
  channel?: string;
}) {
  const result = db.insert(abVariants).values({
    campaignId: input.campaignId || null,
    name: input.name,
    variantA: JSON.stringify(input.variantA),
    variantB: JSON.stringify(input.variantB),
    channel: (input.channel || "email") as "email" | "whatsapp" | "both",
  }).run();

  return { id: Number(result.lastInsertRowid) };
}

export function updateABTest(id: number, updates: { status?: string; winnerId?: string }) {
  db.update(abVariants)
    .set({ status: (updates.status || "completed") as "active" | "completed" })
    .where(eq(abVariants.id, id))
    .run();

  if (updates.winnerId && updates.status === "completed") {
    const test = db.select().from(abVariants).where(eq(abVariants.id, id)).get();
    if (test && test.campaignId) {
      const winnerConfig = JSON.parse(updates.winnerId === "A" ? test.variantA : test.variantB);
      if (winnerConfig.tone) {
        db.update(campaigns)
          .set({ defaultTone: winnerConfig.tone })
          .where(eq(campaigns.id, test.campaignId))
          .run();
      }
    }
  }

  return { success: true };
}

export function deleteABTest(id: number) {
  const deleteTx = sqlite.transaction(() => {
    db.delete(abResults).where(eq(abResults.variantId, id)).run();
    db.delete(abVariants).where(eq(abVariants.id, id)).run();
  });
  deleteTx();
  return { success: true };
}
