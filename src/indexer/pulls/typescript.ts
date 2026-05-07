import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { readJson, readText } from "../../lib/state.js";

export interface PackageInfo {
  name: string;
  version: string;
  exports: unknown;
  deps: string[];
  path: string;
}

export interface TsConfigInfo {
  paths: Record<string, string[]>;
  references: Array<{ path: string }>;
}

export interface NextRoute {
  path: string;
  methods: string[];
  file: string;
}

export interface TypeScriptPull {
  packages: PackageInfo[];
  tsPaths: TsConfigInfo;
  nextRoutes: NextRoute[];
}

export function pullTypeScript(root: string): TypeScriptPull {
  return {
    packages: pullPackages(root),
    tsPaths: pullTsConfig(root),
    nextRoutes: pullNextRoutes(root),
  };
}

interface RawPackageJson {
  name?: string;
  version?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

function pullPackages(root: string): PackageInfo[] {
  const out: PackageInfo[] = [];

  const rootPkg = readJson<RawPackageJson>(join(root, "package.json"));
  if (rootPkg) out.push(packageInfoFrom(root, root, rootPkg));

  const seen = new Set<string>([root]);
  for (const dir of expandWorkspaceDirs(root, collectWorkspacePatterns(root, rootPkg))) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    const pkg = readJson<RawPackageJson>(join(dir, "package.json"));
    if (!pkg) continue;
    out.push(packageInfoFrom(root, dir, pkg));
  }

  return out;
}

function packageInfoFrom(root: string, dir: string, pkg: RawPackageJson): PackageInfo {
  const deps = new Set<string>();
  for (const block of [pkg.dependencies, pkg.devDependencies]) {
    if (!block) continue;
    for (const name of Object.keys(block)) deps.add(name);
  }
  return {
    name: pkg.name ?? basename(dir),
    version: pkg.version ?? "0.0.0",
    exports: pkg.exports ?? null,
    deps: [...deps].sort(),
    path: relPath(root, dir),
  };
}

function collectWorkspacePatterns(root: string, rootPkg: RawPackageJson | null): string[] {
  const out: string[] = [];
  const ws = rootPkg?.workspaces;
  if (Array.isArray(ws)) out.push(...ws);
  else if (ws?.packages) out.push(...ws.packages);

  const pnpmYaml = readText(join(root, "pnpm-workspace.yaml"));
  if (pnpmYaml) out.push(...parsePnpmWorkspaces(pnpmYaml));

  return out;
}

// Minimal pnpm-workspace.yaml reader: locate the `packages:` block,
// collect "- pattern" entries until indentation drops or another top-level key starts.
function parsePnpmWorkspaces(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const out: string[] = [];
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    if (!inBlock) {
      if (/^packages\s*:\s*$/.test(line)) inBlock = true;
      continue;
    }
    if (/^\S/.test(line)) break;
    const m = /^\s*-\s*['"]?(.+?)['"]?\s*$/.exec(line);
    const value = m?.[1];
    if (value && !value.startsWith("!")) out.push(value);
  }
  return out;
}

function expandWorkspaceDirs(root: string, patterns: string[]): string[] {
  const dirs = new Set<string>();
  for (const pattern of patterns) {
    for (const dir of expandPattern(root, pattern)) dirs.add(dir);
  }
  return [...dirs];
}

function expandPattern(root: string, pattern: string): string[] {
  const normalized = pattern.replace(/\\/g, "/").replace(/\/$/, "");
  if (normalized.endsWith("/*")) {
    return listDirChildren(join(root, normalized.slice(0, -2)));
  }
  if (normalized.endsWith("/**")) {
    return listDirChildren(join(root, normalized.slice(0, -3)));
  }
  if (normalized.includes("*")) return [];
  const literal = join(root, normalized);
  return isDir(literal) ? [literal] : [];
}

function listDirChildren(parent: string): string[] {
  if (!isDir(parent)) return [];
  let entries: string[];
  try {
    entries = readdirSync(parent);
  } catch {
    return [];
  }
  return entries.map((name) => join(parent, name)).filter(isDir);
}

function pullTsConfig(root: string): TsConfigInfo {
  const empty: TsConfigInfo = { paths: {}, references: [] };
  const raw = readText(join(root, "tsconfig.json"));
  if (!raw) return empty;

  const json = parseJsonc<{
    compilerOptions?: { paths?: Record<string, string[]> };
    references?: Array<{ path: string }>;
  }>(raw);
  if (!json) return empty;

  return {
    paths: json.compilerOptions?.paths ?? {},
    references: json.references ?? [],
  };
}

function parseJsonc<T>(raw: string): T | null {
  try {
    return JSON.parse(stripJsonComments(raw)) as T;
  } catch {
    return null;
  }
}

// Strip // line comments and /* ... */ block comments while leaving string literals intact.
function stripJsonComments(raw: string): string {
  const len = raw.length;
  let out = "";
  let i = 0;
  let inString = false;
  let stringChar = "";
  while (i < len) {
    const ch = raw[i] ?? "";
    const next = raw[i + 1] ?? "";
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < len) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === stringChar) inString = false;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < len && raw[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < len && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const NEXT_CONFIG_NAMES = [
  "next.config.js",
  "next.config.mjs",
  "next.config.cjs",
  "next.config.ts",
];
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;
const HTTP_METHOD_RE = new RegExp(
  String.raw`export\s+(?:async\s+)?function\s+(${HTTP_METHODS.join("|")})\b`,
  "g",
);
const PAGE_FILE_RE = /^page\.(tsx|ts|jsx|js|md|mdx)$/;
const ROUTE_FILE_RE = /^route\.(tsx?|jsx?)$/;

function pullNextRoutes(root: string): NextRoute[] {
  if (!hasNextConfig(root)) return [];
  const appDir = findAppDir(root);
  if (!appDir) return [];

  const out: NextRoute[] = [];
  walkAppDir(appDir, [], (file, segments) => {
    const name = basename(file);
    if (PAGE_FILE_RE.test(name)) {
      out.push({
        path: routePathFromSegments(segments),
        methods: [],
        file: relPath(root, file),
      });
    } else if (ROUTE_FILE_RE.test(name)) {
      out.push({
        path: routePathFromSegments(segments),
        methods: extractHttpMethods(safeReadFile(file)),
        file: relPath(root, file),
      });
    }
  });
  return out;
}

function hasNextConfig(root: string): boolean {
  return NEXT_CONFIG_NAMES.some((name) => existsSync(join(root, name)));
}

function findAppDir(root: string): string | null {
  const direct = join(root, "app");
  if (isDir(direct)) return direct;
  const inSrc = join(root, "src", "app");
  if (isDir(inSrc)) return inSrc;
  return null;
}

function walkAppDir(
  dir: string,
  segments: string[],
  visit: (file: string, segments: string[]) => void,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const stat = safeStat(full);
    if (!stat) continue;
    if (stat.isDirectory()) {
      if (name.startsWith("_") || name === "node_modules") continue;
      const nextSegments = isRouteGroup(name) ? segments : [...segments, name];
      walkAppDir(full, nextSegments, visit);
    } else if (stat.isFile()) {
      visit(full, segments);
    }
  }
}

function isRouteGroup(name: string): boolean {
  return name.startsWith("(") && name.endsWith(")");
}

function routePathFromSegments(segments: string[]): string {
  if (segments.length === 0) return "/";
  return "/" + segments.join("/");
}

function extractHttpMethods(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(HTTP_METHOD_RE)) {
    const method = match[1];
    if (method) found.add(method);
  }
  return [...found];
}

function safeStat(path: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function isDir(path: string): boolean {
  return safeStat(path)?.isDirectory() ?? false;
}

function safeReadFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function relPath(root: string, path: string): string {
  const rel = relative(root, path);
  return rel === "" ? "." : rel.split(sep).join("/");
}
