import { hasStateDir, stateFile } from "../lib/paths.js";
import { readJson, readText } from "../lib/state.js";
import type { ProjectState } from "../lib/state.js";

const DECISIONS_TAIL_LINES = 80;

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: "SessionStart";
    additionalContext: string;
  };
}

export async function sessionStart(_argv: string[]): Promise<void> {
  await drainStdin();

  const root = process.cwd();
  if (!hasStateDir(root)) {
    process.exit(0);
  }

  const project = readJson<ProjectState>(stateFile(root, "project"));
  const currentTask = readText(stateFile(root, "currentTask"));
  const decisions = readText(stateFile(root, "decisions"));

  const additionalContext = buildContext(project, currentTask, decisions);
  const payload: HookOutput = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(payload));
  process.stdout.write("\n");
}

async function drainStdin(): Promise<void> {
  if (process.stdin.isTTY) return;
  for await (const _chunk of process.stdin) {
    void _chunk;
  }
}

function buildContext(
  project: ProjectState | null,
  currentTask: string | null,
  decisions: string | null,
): string {
  const lines: string[] = [];
  lines.push("Project state loaded from .claude-state/ at session start.");
  lines.push("");

  if (project) {
    lines.push("== Project ==");
    lines.push(`name: ${project.name}`);
    lines.push(`root: ${project.root}`);
    const stack = project.stack;
    lines.push(`languages: ${stack.languages.join(", ") || "(none detected)"}`);
    lines.push(`frameworks: ${stack.frameworks.join(", ") || "(none detected)"}`);
    lines.push(`package manager: ${stack.packageManager ?? "(none detected)"}`);
    if (stack.node) lines.push(`node engine: ${stack.node}`);
    if (stack.php) lines.push(`php platform: ${stack.php}`);
    if (stack.monorepo.isMonorepo) {
      lines.push(`monorepo: yes (${stack.monorepo.signals.join(", ")})`);
    }
    lines.push(`updated: ${project.updatedAt}`);
    lines.push("");
  } else {
    lines.push("== Project ==");
    lines.push("project.json was not present in .claude-state/.");
    lines.push("");
  }

  lines.push("== Current task ==");
  lines.push(currentTask?.trim() || "(no current-task.md found)");
  lines.push("");

  lines.push(`== Recent decisions (last ${DECISIONS_TAIL_LINES} lines) ==`);
  lines.push(tailLines(decisions, DECISIONS_TAIL_LINES) || "(no decisions.md found)");

  return lines.join("\n");
}

function tailLines(content: string | null, count: number): string {
  if (!content) return "";
  const all = content.split(/\r?\n/);
  return all.slice(Math.max(0, all.length - count)).join("\n").trim();
}
