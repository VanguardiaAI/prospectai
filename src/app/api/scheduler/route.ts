import { NextRequest, NextResponse } from "next/server";
import { startScheduler, stopScheduler, isSchedulerRunning } from "@/lib/scheduler";

export async function GET() {
  return NextResponse.json({ running: isSchedulerRunning() });
}

export async function POST(request: NextRequest) {
  const { action } = await request.json();

  if (action === "start") {
    startScheduler();
    return NextResponse.json({ success: true, running: true });
  }

  if (action === "stop") {
    stopScheduler();
    return NextResponse.json({ success: true, running: false });
  }

  return NextResponse.json({ error: "Invalid action. Use 'start' or 'stop'" }, { status: 400 });
}
