---
description: Diff the current branch's skill-file edits against their own conventions
---

1. `git diff main...HEAD -- SKILL_watch_advisor2.md SKILL_wardrobe_v10.md`. If empty, say so and stop.
2. Read the **current** versions of each file to learn its conventions (section structure, voice, list formatting).
3. For each changed section, check:
   - Section heading level matches siblings.
   - New entries use the same field labels as surrounding entries (e.g. **Case diameter**, **Dress code**).
   - Hebrew RTL marks preserved where they existed.
   - No duplicated entries (a watch/garment listed twice).
   - No silent removal of an existing entry — surface every deletion.
4. Report:
   - **Blockers**: violations (with line numbers).
   - **Worth discussing**: style drift.
   - **Verdict**: pass | fail.

Do not fix the file.
