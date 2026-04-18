---
name: handoff-format
description: Canonical format for watch-advisor2 `.cowork/<slug>.md` handoff files. Load whenever writing or reading a handoff.
---

# cowork handoff format (watch-advisor2)

`.cowork/<slug>.md`, one per active branch, committed.

## Required sections

### Header
```
# <slug>

**Branch:** cowork/<slug>
**Last session:** YYYY-MM-DD (model)
**Status:** in-progress | blocked: <reason> | ready-to-land
```

### Goal
One paragraph. The anchor — never edit after first session.

### Done
Artifact bullets. Examples:
- `Watch_Collection_v10.md`: added Sub 16610, retagged 126710 as “daily”.
- `SKILL_wardrobe_v10.md`: new section “Linen rules”.
- `src/lib/pick.ts`: fixed dress-code filter for “business-casual”.
NO vague bullets (“improved”, “cleaned”).

### Next
One or two concrete actions with file paths.

### Tests
One line per suite.

### Notes for next Claude
Non-obvious only:
- A choice pending `/cowork:second-opinion`.
- A skill convention bent deliberately.
- A Supabase migration queued.

## Not allowed
Chat summary, diff restatement, unrelated follow-ups. Use commits, `git diff`, GitHub issues.
