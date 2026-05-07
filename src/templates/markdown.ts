export const CURRENT_TASK_TEMPLATE = `# Current Task

No active task is recorded.

## Status
Project state was initialized. No work is in progress.

## Notes
This file is updated by the /wrap-session slash command at the end of a working session.
`;

export const DECISIONS_TEMPLATE = `# Decisions

This file accumulates project-level decisions over time. Newest entries appear at the bottom.

The /wrap-session slash command appends to this file when a working session ends.
`;

export const WRAP_SESSION_COMMAND = `---
description: Capture current task state and any decisions before ending the session
---

Update \`.claude-state/\` to reflect the current state of work.

1. Read \`.claude-state/current-task.md\` to see the prior recorded task.
2. Replace it with a concise summary of:
   - The active task, or "no active task" if work was completed.
   - Any in-progress changes that are not committed.
   - Files touched in this session.
3. If noteworthy decisions were made (architecture choices, tech selections, scope changes), append them to \`.claude-state/decisions.md\` under a today-dated header.
4. Stage but do not commit changes so the user can review.
`;

export const LOAD_CONTEXT_COMMAND = `---
description: Reload project state and current task context from .claude-state/
---

Read these files and summarize the current project state:

- \`.claude-state/project.json\` — stack, languages, frameworks, monorepo info.
- \`.claude-state/current-task.md\` — what was being worked on.
- \`.claude-state/decisions.md\` — past decisions.

Then briefly state what the user is likely working on next, based on the current task entry.
`;
