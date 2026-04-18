---
description: Create a committable markdown poll of outfit/watch options with rationale per option
argument-hint: <question>  (e.g. "navy blazer or charcoal blazer for Milan dinner")
---

Create (or append to) `.cowork/polls/<timestamp>-<slug>.md` with:

```md
# Poll: $ARGUMENTS

**Branch:** <current>
**Date:** <today>

## Options

### A: <option>
- Pros: ...
- Cons: ...
- Per SKILL_wardrobe_v10.md: ...

### B: <option>
- ...

## Decision
_(left empty until the user picks — do not decide unilaterally)_

## Rationale
_(filled after decision)_
```

Fill in the Options section yourself by consulting `SKILL_wardrobe_v10.md` / `SKILL_watch_advisor2.md`. Leave Decision + Rationale empty. Commit with `cowork: poll $ARGUMENTS`. Don't push.
