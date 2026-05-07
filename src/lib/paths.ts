import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const STATE_DIR = ".claude-state";
export const CLAUDE_DIR = ".claude";

export const STATE_FILES = {
  project: "project.json",
  projectMap: "project-map.json",
  currentTask: "current-task.md",
  decisions: "decisions.md",
  sessionsLog: "sessions.log",
  cache: ".cache.json",
  fileMap: "file-map.json",
} as const;

export const CLAUDE_FILES = {
  settings: "settings.json",
  commandsDir: "commands",
} as const;

const ROOT_MARKERS = [
  ".git",
  STATE_DIR,
  "package.json",
  "composer.json",
] as const;

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let current = resolve(startDir);
  while (true) {
    for (const marker of ROOT_MARKERS) {
      if (existsSync(join(current, marker))) {
        return current;
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function stateDirOf(projectRoot: string): string {
  return join(projectRoot, STATE_DIR);
}

export function claudeDirOf(projectRoot: string): string {
  return join(projectRoot, CLAUDE_DIR);
}

export function stateFile(projectRoot: string, name: keyof typeof STATE_FILES): string {
  return join(stateDirOf(projectRoot), STATE_FILES[name]);
}

export function claudeFile(projectRoot: string, name: keyof typeof CLAUDE_FILES): string {
  return join(claudeDirOf(projectRoot), CLAUDE_FILES[name]);
}

export function hasStateDir(projectRoot: string): boolean {
  return isDir(stateDirOf(projectRoot));
}
