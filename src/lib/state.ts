import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const SCHEMA_VERSION = 1;

export interface ProjectState {
  schemaVersion: number;
  name: string;
  root: string;
  createdAt: string;
  updatedAt: string;
  stack: StackSummary;
}

export interface StackSummary {
  languages: string[];
  frameworks: string[];
  packageManager: string | null;
  node: string | null;
  php: string | null;
  monorepo: MonorepoInfo;
  manifests: string[];
}

export interface MonorepoInfo {
  isMonorepo: boolean;
  signals: string[];
  workspaces: string[];
}

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function readJson<T = unknown>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function readText(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export function writeText(filePath: string, content: string): void {
  ensureDir(filePath);
  const trailing = content.endsWith("\n") ? "" : "\n";
  writeFileSync(filePath, content + trailing, "utf8");
}

export function appendText(filePath: string, line: string): void {
  ensureDir(filePath);
  const trailing = line.endsWith("\n") ? "" : "\n";
  writeFileSync(filePath, line + trailing, { encoding: "utf8", flag: "a" });
}
