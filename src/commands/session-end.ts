import { hasStateDir, stateFile } from "../lib/paths.js";
import { appendText } from "../lib/state.js";

interface SessionEndPayload {
  session_id?: string;
  reason?: string;
  hook_event_name?: string;
  cwd?: string;
}

export async function sessionEnd(_argv: string[]): Promise<void> {
  const raw = await readStdin();
  const root = process.cwd();
  if (!hasStateDir(root)) return;

  const payload = parsePayload(raw);
  const line = formatLogLine(payload);
  appendText(stateFile(root, "sessionsLog"), line);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parsePayload(raw: string): SessionEndPayload {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") return parsed as SessionEndPayload;
  } catch {
    /* ignore — log what we can */
  }
  return {};
}

function formatLogLine(payload: SessionEndPayload): string {
  const ts = new Date().toISOString();
  const id = payload.session_id ?? "unknown";
  const reason = payload.reason ?? "unknown";
  return `${ts}\t${id}\t${reason}`;
}
