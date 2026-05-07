import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CLAUDE_FILES,
  claudeDirOf,
  claudeFile,
  findProjectRoot,
  stateFile,
} from "../lib/paths.js";
import { detectStack, projectNameFor } from "../lib/stack.js";
import {
  SCHEMA_VERSION,
  appendText,
  readJson,
  readText,
  writeJson,
  writeText,
} from "../lib/state.js";
import type { ProjectState, StackSummary } from "../lib/state.js";
import {
  CURRENT_TASK_TEMPLATE,
  DECISIONS_TEMPLATE,
  LOAD_CONTEXT_COMMAND,
  WRAP_SESSION_COMMAND,
} from "../templates/markdown.js";
import { mergeSettings } from "../templates/settings.js";

export async function init(argv: string[]): Promise<void> {
  const force = argv.includes("--force") || argv.includes("-f");
  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.error(
      "claude-state: no project root found. Run inside a directory with package.json, composer.json, or a .git folder.",
    );
    process.exit(1);
  }

  const stack = detectStack(root);
  const name = projectNameFor(root);

  printDetection(name, root, stack);

  writeProjectJson(root, name, stack, force);
  writeMarkdownIfMissing(root, "currentTask", CURRENT_TASK_TEMPLATE);
  writeMarkdownIfMissing(root, "decisions", DECISIONS_TEMPLATE);
  writeSettings(root);
  writeSlashCommandIfMissing(root, "wrap-session", WRAP_SESSION_COMMAND);
  writeSlashCommandIfMissing(root, "load-context", LOAD_CONTEXT_COMMAND);
  ensureGitignoreEntries(root);

  printNextSteps();
}

function writeProjectJson(
  root: string,
  name: string,
  stack: StackSummary,
  force: boolean,
): void {
  const path = stateFile(root, "project");
  const existing = readJson<ProjectState>(path);
  const now = new Date().toISOString();
  const state: ProjectState =
    existing && !force
      ? { ...existing, name, root, updatedAt: now, stack }
      : {
          schemaVersion: SCHEMA_VERSION,
          name,
          root,
          createdAt: now,
          updatedAt: now,
          stack,
        };
  writeJson(path, state);
  reportWrite(root, path, !!existing);
}

function writeMarkdownIfMissing(
  root: string,
  key: "currentTask" | "decisions",
  content: string,
): void {
  const path = stateFile(root, key);
  if (existsSync(path)) {
    reportSkip(root, path);
    return;
  }
  writeText(path, content);
  reportWrite(root, path, false);
}

function writeSettings(root: string): void {
  const path = claudeFile(root, "settings");
  const existing = readJson<Record<string, unknown>>(path);
  writeJson(path, mergeSettings(existing));
  reportWrite(root, path, !!existing);
}

function writeSlashCommandIfMissing(
  root: string,
  name: string,
  content: string,
): void {
  const path = join(claudeDirOf(root), CLAUDE_FILES.commandsDir, `${name}.md`);
  if (existsSync(path)) {
    reportSkip(root, path);
    return;
  }
  writeText(path, content);
  reportWrite(root, path, false);
}

function ensureGitignoreEntries(root: string): void {
  const path = join(root, ".gitignore");
  const existing = readText(path) ?? "";
  const entries = [
    ".claude-state/.cache.json",
    ".claude-state/file-map.json",
  ];
  const present = new Set(
    existing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
  const toAdd = entries.filter((entry) => !present.has(entry));
  if (toAdd.length === 0) {
    if (existsSync(path)) reportSkip(root, path);
    return;
  }
  const prefix = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  const block = `${prefix}# claude-state\n${toAdd.join("\n")}\n`;
  appendText(path, block);
  console.log(
    `  + ${relPath(root, path)} (added ${toAdd.length} entr${toAdd.length === 1 ? "y" : "ies"})`,
  );
}

function printDetection(name: string, root: string, stack: StackSummary): void {
  console.log("claude-state init");
  console.log(`  project          ${name}`);
  console.log(`  root             ${root}`);
  console.log(`  languages        ${stack.languages.join(", ") || "(none)"}`);
  console.log(`  frameworks       ${stack.frameworks.join(", ") || "(none)"}`);
  console.log(`  package manager  ${stack.packageManager ?? "(none)"}`);
  if (stack.node) console.log(`  node engine      ${stack.node}`);
  if (stack.php) console.log(`  php platform     ${stack.php}`);
  if (stack.monorepo.isMonorepo) {
    console.log(`  monorepo         yes (${stack.monorepo.signals.join(", ")})`);
  }
  console.log("");
}

function printNextSteps(): void {
  console.log("");
  console.log("Next steps:");
  console.log("  • Restart Claude Code so SessionStart/SessionEnd hooks load.");
  console.log("  • Run /load-context inside Claude Code to verify state injection.");
  console.log("  • Run /wrap-session before ending a working session.");
}

function reportWrite(root: string, path: string, updated: boolean): void {
  console.log(`  ${updated ? "~" : "+"} ${relPath(root, path)}`);
}

function reportSkip(root: string, path: string): void {
  console.log(`  · ${relPath(root, path)} (kept)`);
}

function relPath(root: string, path: string): string {
  return relative(root, path).replace(/\\/g, "/");
}
