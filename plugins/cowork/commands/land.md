---
description: Land the current cowork branch onto main
---

1. Branch must be `cowork/*`.
2. `git fetch origin main && git rebase origin/main`. Conflicts → stop, print.
3. **Skill-diff guard**: run `/cowork:skill-diff` internally — any violation = blocker.
4. `npm test --silent`, any build/lint script — all must pass.
5. Read `.cowork/<slug>.md`. Draft squash message: title `<type>(scope): <goal>`; body = **Done** bullets; footer `Cowork-branch: cowork/<slug>`.
6. Print the message + git commands. Do NOT merge/push.
