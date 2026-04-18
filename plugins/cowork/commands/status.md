---
description: Summary of all cowork/* branches
---

1. `git fetch origin --prune`.
2. Enumerate cowork branches (local + remote, dedupe).
3. Per branch (parallel):
   - ahead/behind main.
   - Read `.cowork/<slug>.md`: **Status**, **Last session**.
   - `git diff --stat main...<branch> -- SKILL_*.md Watch_Collection_v10.md` → skill / collection line delta.
4. Table: `branch | status | ahead/behind | skill linesΔ | age | flags`.
5. Recommend smallest `ready-to-land` first; flag handoffs older than 14 days.
