export interface HookEntry {
  type: "command";
  command: string;
}

export interface HookGroup {
  hooks: HookEntry[];
  matcher?: string;
}

const PKG_TAG = "@techtonauts/claude-state";

export const HOOK_COMMANDS = {
  SessionStart: `npx -y ${PKG_TAG} session-start`,
  SessionEnd: `npx -y ${PKG_TAG} session-end`,
} as const;

function buildGroup(command: string): HookGroup {
  return { hooks: [{ type: "command", command }] };
}

function isOurs(group: HookGroup): boolean {
  return group.hooks.some(
    (h) => h.type === "command" && h.command.includes(PKG_TAG),
  );
}

function ensureHook(existing: HookGroup[] | undefined, desired: string): HookGroup[] {
  const list = (existing ?? []).filter((g) => !isOurs(g));
  list.push(buildGroup(desired));
  return list;
}

export function mergeSettings(
  existing: Record<string, unknown> | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  const currentHooks = (next.hooks ?? {}) as Record<string, HookGroup[]>;
  next.hooks = {
    ...currentHooks,
    SessionStart: ensureHook(currentHooks.SessionStart, HOOK_COMMANDS.SessionStart),
    SessionEnd: ensureHook(currentHooks.SessionEnd, HOOK_COMMANDS.SessionEnd),
  };
  return next;
}
