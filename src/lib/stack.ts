import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { readJson } from "./state.js";
import type { MonorepoInfo, StackSummary } from "./state.js";

interface PackageJson {
  name?: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

interface ComposerJson {
  name?: string;
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
  config?: { platform?: { php?: string } };
}

const LOCKFILE_TO_PM: ReadonlyArray<[string, string]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

const JS_FRAMEWORK_HINTS: ReadonlyArray<[string, string]> = [
  ["next", "next"],
  ["react", "react"],
  ["vue", "vue"],
  ["@angular/core", "angular"],
  ["svelte", "svelte"],
  ["nuxt", "nuxt"],
  ["astro", "astro"],
  ["remix", "remix"],
  ["@remix-run/react", "remix"],
  ["solid-js", "solid"],
  ["express", "express"],
  ["fastify", "fastify"],
  ["koa", "koa"],
  ["hono", "hono"],
  ["@nestjs/core", "nestjs"],
  ["vite", "vite"],
  ["webpack", "webpack"],
  ["esbuild", "esbuild"],
  ["tsup", "tsup"],
  ["vitest", "vitest"],
  ["jest", "jest"],
  ["@playwright/test", "playwright"],
  ["cypress", "cypress"],
  ["tailwindcss", "tailwind"],
  ["prisma", "prisma"],
  ["drizzle-orm", "drizzle"],
  ["typeorm", "typeorm"],
  ["mongoose", "mongoose"],
  ["electron", "electron"],
  ["expo", "expo"],
  ["react-native", "react-native"],
];

const PHP_FRAMEWORK_HINTS: ReadonlyArray<[string, string]> = [
  ["laravel/framework", "laravel"],
  ["symfony/symfony", "symfony"],
  ["symfony/framework-bundle", "symfony"],
  ["cakephp/cakephp", "cakephp"],
  ["yiisoft/yii2", "yii2"],
  ["codeigniter4/framework", "codeigniter"],
  ["slim/slim", "slim"],
  ["phpunit/phpunit", "phpunit"],
  ["pestphp/pest", "pest"],
  ["filament/filament", "filament"],
  ["livewire/livewire", "livewire"],
  ["inertiajs/inertia-laravel", "inertia"],
  ["nunomaduro/larastan", "larastan"],
  ["laravel/sanctum", "sanctum"],
  ["laravel/passport", "passport"],
];

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

function detectPackageManager(root: string): string | null {
  for (const [file, pm] of LOCKFILE_TO_PM) {
    if (existsSync(join(root, file))) return pm;
  }
  return null;
}

function collectDeps(pkg: PackageJson): Set<string> {
  const all = new Set<string>();
  for (const block of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
    if (!block) continue;
    for (const name of Object.keys(block)) all.add(name);
  }
  return all;
}

function detectJsFrameworks(deps: Set<string>): string[] {
  const found = new Set<string>();
  for (const [dep, label] of JS_FRAMEWORK_HINTS) {
    if (deps.has(dep)) found.add(label);
  }
  return [...found];
}

function detectPhpFrameworks(composer: ComposerJson): string[] {
  const all = new Set<string>();
  for (const block of [composer.require, composer["require-dev"]]) {
    if (!block) continue;
    for (const name of Object.keys(block)) all.add(name);
  }
  const found = new Set<string>();
  for (const [dep, label] of PHP_FRAMEWORK_HINTS) {
    if (all.has(dep)) found.add(label);
  }
  return [...found];
}

function workspacePatternsOf(pkg: PackageJson): string[] {
  const ws = pkg.workspaces;
  if (!ws) return [];
  if (Array.isArray(ws)) return ws;
  return ws.packages ?? [];
}

function detectMonorepo(root: string, pkg: PackageJson | null): MonorepoInfo {
  const signals: string[] = [];
  const workspaces = pkg ? workspacePatternsOf(pkg) : [];
  if (workspaces.length > 0) signals.push("package.json#workspaces");
  if (existsSync(join(root, "pnpm-workspace.yaml"))) signals.push("pnpm-workspace.yaml");
  if (existsSync(join(root, "turbo.json"))) signals.push("turbo.json");
  if (existsSync(join(root, "nx.json"))) signals.push("nx.json");
  if (existsSync(join(root, "lerna.json"))) signals.push("lerna.json");
  if (existsSync(join(root, "rush.json"))) signals.push("rush.json");
  const apps = isDir(join(root, "apps"));
  const packages = isDir(join(root, "packages"));
  if (apps) signals.push("apps/");
  if (packages) signals.push("packages/");
  return {
    isMonorepo: signals.length > 0 && (workspaces.length > 0 || apps || packages || signals.length >= 2),
    signals,
    workspaces,
  };
}

function detectLanguages(root: string, hasPackageJson: boolean, hasComposerJson: boolean, deps: Set<string>): string[] {
  const langs = new Set<string>();
  if (hasPackageJson) langs.add("javascript");
  if (deps.has("typescript") || existsSync(join(root, "tsconfig.json"))) langs.add("typescript");
  if (hasComposerJson) langs.add("php");
  if (existsSync(join(root, "go.mod"))) langs.add("go");
  if (existsSync(join(root, "Cargo.toml"))) langs.add("rust");
  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "requirements.txt"))) langs.add("python");
  if (existsSync(join(root, "Gemfile"))) langs.add("ruby");
  return [...langs];
}

export function detectStack(root: string): StackSummary {
  const pkgPath = join(root, "package.json");
  const composerPath = join(root, "composer.json");
  const pkg = readJson<PackageJson>(pkgPath);
  const composer = readJson<ComposerJson>(composerPath);

  const deps = pkg ? collectDeps(pkg) : new Set<string>();
  const manifests: string[] = [];
  if (pkg) manifests.push(basename(pkgPath));
  if (composer) manifests.push(basename(composerPath));

  const frameworks = [
    ...(pkg ? detectJsFrameworks(deps) : []),
    ...(composer ? detectPhpFrameworks(composer) : []),
  ];

  return {
    languages: detectLanguages(root, !!pkg, !!composer, deps),
    frameworks,
    packageManager: detectPackageManager(root),
    node: pkg?.engines?.node ?? null,
    php: composer?.config?.platform?.php ?? null,
    monorepo: detectMonorepo(root, pkg),
    manifests,
  };
}

export function projectNameFor(root: string): string {
  const pkg = readJson<PackageJson>(join(root, "package.json"));
  if (pkg?.name) return pkg.name;
  const composer = readJson<ComposerJson>(join(root, "composer.json"));
  if (composer?.name) return composer.name;
  return basename(root);
}
