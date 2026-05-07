import { relative } from "node:path";
import { findProjectRoot, hasStateDir } from "../lib/paths.js";
import { writeProjectMap } from "../indexer/write-project-map.js";
import type { ProjectMap } from "../indexer/write-project-map.js";

interface IndexFlags {
  force: boolean;
  quiet: boolean;
  verbose: boolean;
}

export async function index(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);

  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.error(
      "claude-state: no project root found. Run inside a directory with package.json, composer.json, or a .git folder.",
    );
    process.exit(1);
  }
  if (!hasStateDir(root)) {
    console.error(
      "claude-state: .claude-state/ not found. Run `claude-state init` first.",
    );
    process.exit(1);
  }

  if (!flags.quiet) console.log("indexing...");

  const { path, map } = writeProjectMap(root);

  if (flags.quiet) return;

  console.log(`  + ${relPath(root, path)}`);
  printSummary(map, flags.verbose);
  printWarnings(map);
}

function printSummary(map: ProjectMap, verbose: boolean): void {
  const ts = map.typescript;
  if (ts) {
    const pathCount = Object.keys(ts.tsPaths.paths).length;
    const refCount = ts.tsPaths.references.length;
    console.log(
      `    typescript: ${ts.packages.length} package${plural(ts.packages.length)}` +
        `, ${ts.nextRoutes.length} next route${plural(ts.nextRoutes.length)}` +
        `, ${pathCount} ts path${plural(pathCount)}` +
        `, ${refCount} reference${plural(refCount)}`,
    );
    if (verbose) {
      for (const pkg of ts.packages) {
        console.log(
          `      • ${pkg.name}@${pkg.version}  (${pkg.path})  ${pkg.deps.length} dep${plural(pkg.deps.length)}`,
        );
      }
      for (const route of ts.nextRoutes) {
        const methods = route.methods.length > 0 ? `[${route.methods.join(", ")}]` : "[page]";
        console.log(`      • ${route.path}  ${methods}  ${route.file}`);
      }
    }
  } else {
    console.log("    typescript: (no package.json)");
  }

  const lv = map.laravel;
  if (lv) {
    const routes = lv.routes === null ? "unavailable" : `${lv.routes.length}`;
    console.log(
      `    laravel:    ${lv.models.length} model${plural(lv.models.length)}` +
        `, ${lv.controllers.length} controller${plural(lv.controllers.length)}` +
        `, ${lv.jobs.length} job${plural(lv.jobs.length)}` +
        `, ${lv.services.length} service${plural(lv.services.length)}` +
        `, ${lv.migrations.length} migration${plural(lv.migrations.length)}` +
        `, routes: ${routes}`,
    );
  } else {
    console.log("    laravel:    (no artisan)");
  }
}

function printWarnings(map: ProjectMap): void {
  const warnings = map.laravel?.warnings ?? [];
  for (const w of warnings) console.warn(`  ! ${w}`);
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function relPath(root: string, path: string): string {
  return relative(root, path).replace(/\\/g, "/");
}

function parseFlags(argv: string[]): IndexFlags {
  return {
    force: argv.includes("--force") || argv.includes("-f"),
    quiet: argv.includes("--quiet") || argv.includes("-q"),
    verbose: argv.includes("--verbose") || argv.includes("-v"),
  };
}
