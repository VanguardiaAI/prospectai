import { logger } from "@/lib/logger";

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 1000;
  const label = opts?.label ?? "operation";

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxRetries) break;

      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs;
      logger.warn({ attempt: attempt + 1, maxRetries, delay: Math.round(delay), label, error: lastError.message },
        `Retrying ${label} after failure`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  logger.error({ label, error: lastError?.message }, `${label} failed after ${maxRetries + 1} attempts`);
  throw lastError;
}
