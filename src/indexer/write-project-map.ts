import { existsSync } from "node:fs";
import { join } from "node:path";
import { stateFile } from "../lib/paths.js";
import { writeJson } from "../lib/state.js";
import { detectLaravel, pullLaravel } from "./pulls/laravel.js";
import type { LaravelPull } from "./pulls/laravel.js";
import { pullTypeScript } from "./pulls/typescript.js";
import type { TypeScriptPull } from "./pulls/typescript.js";

export const PROJECT_MAP_VERSION = 1;

export interface ProjectMap {
  version: number;
  generatedAt: string;
  typescript: TypeScriptPull | null;
  laravel: LaravelPull | null;
}

export interface WriteProjectMapResult {
  path: string;
  map: ProjectMap;
}

export function writeProjectMap(root: string): WriteProjectMapResult {
  const map: ProjectMap = {
    version: PROJECT_MAP_VERSION,
    generatedAt: new Date().toISOString(),
    typescript: existsSync(join(root, "package.json")) ? pullTypeScript(root) : null,
    laravel: detectLaravel(root) ? pullLaravel(root) : null,
  };
  const path = stateFile(root, "projectMap");
  writeJson(path, map);
  return { path, map };
}
