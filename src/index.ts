import { index } from "./commands/index.js";
import { init } from "./commands/init.js";
import { sessionEnd } from "./commands/session-end.js";
import { sessionStart } from "./commands/session-start.js";

export async function main(argv: string[]): Promise<void> {
  const cmd = argv[2];
  const rest = argv.slice(3);

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  switch (cmd) {
    case "init":
      await init(rest);
      return;
    case "index":
      await index(rest);
      return;
    case "session-start":
      await sessionStart(rest);
      return;
    case "session-end":
      await sessionEnd(rest);
      return;
    default:
      console.error(`claude-state: unknown command "${cmd}"`);
      printHelp();
      process.exit(2);
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      "claude-state — persistent project state for Claude Code",
      "",
      "Usage:",
      "  claude-state <command>",
      "",
      "Commands:",
      "  init             Bootstrap .claude-state/ in the current project",
      "  index            Index project files into .claude-state/ caches",
      "  session-start    SessionStart hook handler (reads stdin)",
      "  session-end      SessionEnd hook handler (reads stdin)",
      "  help             Show this message",
      "",
    ].join("\n"),
  );
}
