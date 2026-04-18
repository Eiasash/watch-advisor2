---
description: Resume a cowork branch — read handoff, verify, announce next step
---

1. Ensure on a `cowork/*` branch; else ask & checkout.
2. Print **Goal / Next / Notes for next Claude** from `.cowork/<slug>.md` verbatim.
3. `git log --oneline -5`, `git status --porcelain` (flag surprises), `npm test --silent` (flag any regression vs handoff).
4. State in one sentence what you'll do, mapped to **Next**.
