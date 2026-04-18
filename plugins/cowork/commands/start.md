---
description: Cut cowork/<slug> off main with scaffolded handoff
argument-hint: <slug>
---

1. `git rev-parse --abbrev-ref HEAD` must be `main`; else stop.
2. `git fetch origin main && git checkout -b cowork/$ARGUMENTS origin/main`.
3. Scaffold `.cowork/$ARGUMENTS.md` per `skills/handoff-format/SKILL.md`. Ask the user for a **Goal** sentence; do not invent.
4. Test baseline: `npm test --silent 2>&1 | tail -20`, paste into **Tests**.
5. `git add .cowork/ && git commit -m "cowork: start $ARGUMENTS"`. Do not push.
