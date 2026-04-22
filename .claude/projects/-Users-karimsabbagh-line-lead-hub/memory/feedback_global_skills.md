---
name: Always install skills globally
description: Any skill the user provides should be installed globally (~/.claude/skills/) so it's available across all projects
type: feedback
---

Always install Claude Code skills globally, not per-project.

**Why:** User wants skills available across all their projects without re-installing each time.

**How to apply:** When the user gives a skill to install, always use the `--global` flag or install to `~/.claude/skills/`. Never install to `.claude/skills/` at the project level unless explicitly asked.
