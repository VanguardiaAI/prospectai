import { NextRequest, NextResponse } from "next/server";
import { startScheduler, stopScheduler, isSchedulerRunning } from "@/lib/scheduler";
import { validateBody, schedulerActionSchema } from "@/lib/validations";

export async function GET() {
  return NextResponse.json({ running: isSchedulerRunning() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const v = validateBody(schedulerActionSchema, body);
  if (!v.success) return v.response;

  if (v.data.action === "start") {
    startScheduler();
    return NextResponse.json({ success: true, running: true });
  }

  if (v.data.action === "stop") {
    stopScheduler();
    return NextResponse.json({ success: true, running: false });
  }

  return NextResponse.json({ error: "Invalid action. Use 'start' or 'stop'" }, { status: 400 });
}
