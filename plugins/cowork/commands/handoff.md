---
description: Refresh .cowork/<slug>.md for the current branch
---

1. Branch must be `cowork/*`.
2. Collect: `git status --porcelain`, `git diff --stat main...HEAD`, `git log --oneline main..HEAD`, `npm test --silent` per-suite PASS/FAIL.
3. Update sections:
   - **Status**: `in-progress | blocked: <reason> | ready-to-land`.
   - **Done**: concrete artifact bullets (e.g. `Watch_Collection_v10.md: added Sub 16610, moved 126710 to "daily"`). No vague verbs.
   - **Next**: one action, file-path precise.
   - **Tests**: one line per suite.
   - **Notes for next Claude**: non-obvious only — a decision you deferred pending second-opinion, a skill convention you bent intentionally, a Supabase schema change pending migration.
4. Commit `.cowork/`. Don't push. Print the file.
