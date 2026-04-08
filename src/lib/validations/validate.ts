import { z } from "zod";
import { NextResponse } from "next/server";

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = { success: false; response: NextResponse };

export function validateBody<T extends z.ZodType>(
  schema: T,
  body: unknown
): ValidationSuccess<z.infer<T>> | ValidationFailure {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Validation failed", details: result.error.flatten().fieldErrors },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}
