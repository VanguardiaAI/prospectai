import { NextResponse } from "next/server";
import { NotFoundError, ValidationError, ConflictError } from "./errors";
import { logger } from "@/lib/logger";

export function handleServiceError(err: unknown): NextResponse {
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  // Support errors with a statusCode property (e.g. ScraperError)
  if (err instanceof Error && "statusCode" in err) {
    const statusCode = (err as Error & { statusCode: number }).statusCode;
    return NextResponse.json({ error: err.message }, { status: statusCode });
  }

  const message = err instanceof Error ? err.message : "Internal error";
  logger.error({ err }, "Service error");
  return NextResponse.json({ error: message }, { status: 500 });
}
