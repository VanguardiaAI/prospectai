import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { abVariants, abResults, campaigns } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";

// GET: List all A/B tests with results
export async function GET() {
  const tests = db.select({
    test: abVariants,
    campaignName: campaigns.name,
  })
    .from(abVariants)
    .leftJoin(campaigns, eq(abVariants.campaignId, campaigns.id))
    .all();

  // Aggregate results per test
  const enriched = tests.map(({ test, campaignName }) => {
    const resultsA = db.select({
      total: sql<number>`count(*)`,
      opens: sql<number>`sum(${abResults.opened})`,
      clicks: sql<number>`sum(${abResults.clicked})`,
      replies: sql<number>`sum(${abResults.replied})`,
    })
      .from(abResults)
      .where(and(eq(abResults.variantId, test.id), eq(abResults.variantGroup, "A")))
      .get();

    const resultsB = db.select({
      total: sql<number>`count(*)`,
      opens: sql<number>`sum(${abResults.opened})`,
      clicks: sql<number>`sum(${abResults.clicked})`,
      replies: sql<number>`sum(${abResults.replied})`,
    })
      .from(abResults)
      .where(and(eq(abResults.variantId, test.id), eq(abResults.variantGroup, "B")))
      .get();

    // WA results per variant
    const waResultsA = db.select({
      total: sql<number>`count(*)`,
      replies: sql<number>`coalesce(sum(${abResults.replied}), 0)`,
    }).from(abResults)
      .where(and(
        eq(abResults.variantId, test.id),
        eq(abResults.variantGroup, "A"),
        sql`${abResults.whatsappMessageId} IS NOT NULL`
      )).get();

    const waResultsB = db.select({
      total: sql<number>`count(*)`,
      replies: sql<number>`coalesce(sum(${abResults.replied}), 0)`,
    }).from(abResults)
      .where(and(
        eq(abResults.variantId, test.id),
        eq(abResults.variantGroup, "B"),
        sql`${abResults.whatsappMessageId} IS NOT NULL`
      )).get();

    return {
      ...test,
      campaignName,
      channel: test.channel,
      variantAConfig: JSON.parse(test.variantA),
      variantBConfig: JSON.parse(test.variantB),
      resultsA: {
        total: resultsA?.total ?? 0,
        opens: resultsA?.opens ?? 0,
        clicks: resultsA?.clicks ?? 0,
        replies: resultsA?.replies ?? 0,
      },
      resultsB: {
        total: resultsB?.total ?? 0,
        opens: resultsB?.opens ?? 0,
        clicks: resultsB?.clicks ?? 0,
        replies: resultsB?.replies ?? 0,
      },
      waResultsA: {
        total: waResultsA?.total ?? 0,
        replies: waResultsA?.replies ?? 0,
      },
      waResultsB: {
        total: waResultsB?.total ?? 0,
        replies: waResultsB?.replies ?? 0,
      },
    };
  });

  return NextResponse.json(enriched);
}

// POST: Create new A/B test
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { campaignId, name, variantA, variantB, channel } = body;

  if (!name || !variantA || !variantB) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = db.insert(abVariants).values({
    campaignId: campaignId || null,
    name,
    variantA: JSON.stringify(variantA),
    variantB: JSON.stringify(variantB),
    channel: channel || "email",
  }).run();

  return NextResponse.json({ id: result.lastInsertRowid });
}

// PUT: Update test status (complete/declare winner)
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, status, winnerId } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing test id" }, { status: 400 });
  }

  db.update(abVariants)
    .set({ status: status || "completed" })
    .where(eq(abVariants.id, id))
    .run();

  // If declaring winner, apply the winning variant's config as campaign default
  if (winnerId && status === "completed") {
    const test = db.select().from(abVariants).where(eq(abVariants.id, id)).get();
    if (test && test.campaignId) {
      const winnerConfig = JSON.parse(winnerId === "A" ? test.variantA : test.variantB);
      if (winnerConfig.tone) {
        db.update(campaigns)
          .set({ defaultTone: winnerConfig.tone })
          .where(eq(campaigns.id, test.campaignId))
          .run();
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE: Remove a test
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") || "0");

  if (!id) {
    return NextResponse.json({ error: "Missing test id" }, { status: 400 });
  }

  // Delete results first, then the test
  db.delete(abResults).where(eq(abResults.variantId, id)).run();
  db.delete(abVariants).where(eq(abVariants.id, id)).run();

  return NextResponse.json({ success: true });
}
