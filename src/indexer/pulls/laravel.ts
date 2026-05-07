import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { readJson } from "../../lib/state.js";

export interface LaravelPackageInfo {
  name: string;
  psr4: Record<string, string | string[]>;
  deps: string[];
}

export interface LaravelRoute {
  method: string[];
  uri: string;
  name: string | null;
  action: string | null;
  middleware: string[];
  domain: string | null;
}

export interface LaravelPull {
  package: LaravelPackageInfo | null;
  routes: LaravelRoute[] | null;
  models: string[];
  controllers: string[];
  services: string[];
  jobs: string[];
  migrations: string[];
  warnings: string[];
}

export function detectLaravel(root: string): boolean {
  return existsSync(join(root, "artisan"));
}

export function pullLaravel(root: string): LaravelPull | null {
  if (!detectLaravel(root)) return null;

  const warnings: string[] = [];
  return {
    package: pullComposer(root),
    routes: pullRoutes(root, warnings),
    models: listRoleFiles(join(root, "app", "Models")),
    controllers: listRoleFiles(join(root, "app", "Http", "Controllers")),
    services: listRoleFiles(join(root, "app", "Services")),
    jobs: listRoleFiles(join(root, "app", "Jobs")),
    migrations: listMigrations(join(root, "database", "migrations")),
    warnings,
  };
}

interface RawComposer {
  name?: string;
  autoload?: { "psr-4"?: Record<string, string | string[]> };
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
}

function pullComposer(root: string): LaravelPackageInfo | null {
  const raw = readJson<RawComposer>(join(root, "composer.json"));
  if (!raw) return null;

  const deps = new Set<string>();
  for (const block of [raw.require, raw["require-dev"]]) {
    if (!block) continue;
    for (const name of Object.keys(block)) deps.add(name);
  }

  return {
    name: raw.name ?? basename(root),
    psr4: raw.autoload?.["psr-4"] ?? {},
    deps: [...deps].sort(),
  };
}

function pullRoutes(root: string, warnings: string[]): LaravelRoute[] | null {
  let stdout: string;
  try {
    stdout = execFileSync("php", ["artisan", "route:list", "--json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
      windowsHide: true,
    });
  } catch (err) {
    warnings.push(`php artisan route:list failed: ${describeError(err)}`);
    return null;
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    warnings.push("php artisan route:list returned empty output.");
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    warnings.push(`Could not parse artisan route:list output as JSON: ${describeError(err)}`);
    return null;
  }

  if (!Array.isArray(parsed)) {
    warnings.push("artisan route:list output was not a JSON array.");
    return null;
  }

  return parsed.map(normalizeRoute);
}

function normalizeRoute(raw: unknown): LaravelRoute {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const method =
    typeof r["method"] === "string"
      ? r["method"].split("|").map((m) => m.trim()).filter(Boolean)
      : [];
  const middleware = Array.isArray(r["middleware"])
    ? r["middleware"].filter((m): m is string => typeof m === "string")
    : [];
  return {
    method,
    uri: typeof r["uri"] === "string" ? r["uri"] : "",
    name: typeof r["name"] === "string" ? r["name"] : null,
    action: typeof r["action"] === "string" ? r["action"] : null,
    middleware,
    domain: typeof r["domain"] === "string" ? r["domain"] : null,
  };
}

function listRoleFiles(dir: string): string[] {
  if (!isDir(dir)) return [];
  const out: string[] = [];
  walkPhpFiles(dir, dir, out);
  return out.sort();
}

function walkPhpFiles(rootDir: string, current: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(current);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(current, name);
    const stat = safeStat(full);
    if (!stat) continue;
    if (stat.isDirectory()) {
      walkPhpFiles(rootDir, full, out);
    } else if (stat.isFile() && extname(name) === ".php") {
      const rel = relative(rootDir, full).split(sep).join("/");
      out.push(rel.replace(/\.php$/, ""));
    }
  }
}

function listMigrations(dir: string): string[] {
  if (!isDir(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(".php"))
    .map((name) => name.replace(/\.php$/, ""))
    .sort();
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

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
