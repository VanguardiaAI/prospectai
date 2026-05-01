import { spawn } from "node:child_process";
import { logger } from "@/lib/logger";

export interface ClaudeCliOptions {
  /** User prompt (sent via stdin) */
  prompt: string;
  /** System prompt — replaces Claude Code's default. */
  systemPrompt?: string;
  /**
   * JSON Schema describing the expected response shape. When provided, Claude
   * is forced to emit JSON matching the schema and the result is parsed before
   * being returned. Without this, the raw text response is returned.
   */
  jsonSchema?: object;
  /** Model alias or full ID. Default: claude-opus-4-7. */
  model?: string;
  /** Hard timeout in ms. Default: 180_000 (3 min). */
  timeoutMs?: number;
  /** Label for logs. */
  label?: string;
}

interface ClaudeCliEnvelope {
  type: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  /** Populated by `claude -p --json-schema …`. The CLI validates the model's
   *  output against the schema and parses it into this field; when present,
   *  `result` is left empty. */
  structured_output?: unknown;
  error?: string;
  duration_ms?: number;
  total_cost_usd?: number;
}

const CLAUDE_BIN = process.env.CLAUDE_CLI_PATH || "claude";
const DEFAULT_MODEL = process.env.CLAUDE_CLI_MODEL || "claude-opus-4-7";
const DEFAULT_TIMEOUT_MS = 180_000;

const DEFAULT_SYSTEM_PROMPT =
  "You are an AI assistant. Follow the user's instructions exactly. " +
  "When the user asks for a JSON response, output ONLY the JSON object — no preamble, no markdown fences, no commentary.";

/**
 * Run a one-shot prompt against the local `claude -p` CLI.
 *
 * Designed for headless LLM use: tools are disabled, session persistence is
 * off, and the system prompt is replaced (Claude Code's default frames the
 * model as a software-engineering agent, which is wrong for copywriting).
 *
 * Strips CLAUDECODE / CLAUDE_CODE_ENTRYPOINT env vars before spawning so the
 * call works even when the parent process is itself a Claude Code session.
 */
export async function runClaudeCli(opts: ClaudeCliOptions & { jsonSchema: object }): Promise<unknown>;
export async function runClaudeCli(opts: ClaudeCliOptions): Promise<string>;
export async function runClaudeCli(opts: ClaudeCliOptions): Promise<unknown> {
  const {
    prompt,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    jsonSchema,
    model = DEFAULT_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    label = "claude-cli",
  } = opts;

  return new Promise((resolve, reject) => {
    const args: string[] = [
      "-p",
      "--model", model,
      "--output-format", "json",
      "--tools", "",
      "--no-session-persistence",
      "--disable-slash-commands",
      "--system-prompt", systemPrompt,
    ];
    if (jsonSchema) {
      args.push("--json-schema", JSON.stringify(jsonSchema));
    }

    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const startedAt = Date.now();
    const child = spawn(CLAUDE_BIN, args, { env });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`${label}: claude -p timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${label}: failed to spawn '${CLAUDE_BIN}': ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const elapsedMs = Date.now() - startedAt;

      if (code !== 0) {
        logger.warn(
          { label, model, code, elapsedMs, stderrHead: stderr.slice(0, 500) },
          "claude-cli exited non-zero",
        );
        reject(new Error(`${label}: claude -p exited ${code} after ${elapsedMs}ms. stderr: ${stderr.slice(0, 500)}`));
        return;
      }

      let envelope: ClaudeCliEnvelope;
      try {
        envelope = JSON.parse(stdout) as ClaudeCliEnvelope;
      } catch (e) {
        reject(new Error(`${label}: failed to parse claude envelope: ${(e as Error).message}. stdout head: ${stdout.slice(0, 300)}`));
        return;
      }

      if (envelope.is_error || envelope.subtype !== "success") {
        reject(new Error(`${label}: claude returned error subtype=${envelope.subtype}: ${(envelope.result || envelope.error || "").slice(0, 500)}`));
        return;
      }

      logger.debug(
        { label, model, elapsedMs, costUsd: envelope.total_cost_usd },
        "claude-cli ok",
      );

      // With --json-schema the validated, parsed object lives under
      // `structured_output` and `result` is empty. Without a schema, the
      // model's free-form text reply is in `result`.
      if (jsonSchema) {
        if (envelope.structured_output === undefined || envelope.structured_output === null) {
          reject(new Error(`${label}: claude envelope missing 'structured_output' (result head: ${(envelope.result || "").slice(0, 200)})`));
          return;
        }
        resolve(envelope.structured_output);
        return;
      }

      if (typeof envelope.result !== "string") {
        reject(new Error(`${label}: claude envelope missing 'result' field`));
        return;
      }
      resolve(envelope.result);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
