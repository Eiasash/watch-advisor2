---
description: Get an independent review of the current cowork branch's diff
---

Invoke the `style-partner` agent. Pass:

1. `git diff main...HEAD` (full, not summary).
2. The current **Goal** from `.cowork/<slug>.md`.
3. Pointers to `SKILL_watch_advisor2.md` and `SKILL_wardrobe_v10.md` so the agent can check conventions.

Do not summarize the diff before passing it — the agent should see it raw so your framing doesn't leak. Relay the agent's verdict + blockers back to the user.
