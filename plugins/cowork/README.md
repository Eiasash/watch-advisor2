# cowork (watch-advisor2)

Claude Code plugin for branch-based cowork on **watch-advisor2**: `Watch_Collection_v10.md`, `SKILL_watch_advisor2.md`, `SKILL_wardrobe_v10.md`, outfit decisions.

## What it gives you

- **Branch discipline**: `/cowork:start slug` → clean `cowork/<slug>` off main with a committed handoff file.
- **Second opinions**: `/cowork:second-opinion` invokes the `style-partner` agent on the current diff — it has not seen your reasoning, so it gives an independent read.
- **Decision polls**: `/cowork:outfit-poll` turns a “which of these” question into a structured markdown poll committed to the branch so the next session sees the context.
- **Skill-diff guard**: `/cowork:skill-diff` diffs your edits against `SKILL_watch_advisor2.md` / `SKILL_wardrobe_v10.md` conventions before land.
- **Config share**: `/cowork:share-config` renders the current Supabase-stored wardrobe/watch state as a pasteable snapshot for another session to load.
- **SessionStart hook**: if you're on a `cowork/*` branch, the handoff file prints automatically.

## Install

```bash
mkdir -p .claude/plugins
ln -sfn "$PWD/plugins/cowork" .claude/plugins/cowork
```

## Commands

| Command | Purpose |
|---|---|
| `/cowork:start <slug>` | Cut `cowork/<slug>` + scaffold handoff |
| `/cowork:handoff` | Refresh handoff |
| `/cowork:resume` | Read handoff, verify tests |
| `/cowork:status` | All cowork branches summary |
| `/cowork:land` | Rebase + skill-diff guard + test + draft squash msg |
| `/cowork:second-opinion` | `style-partner` agent reviews current diff cold |
| `/cowork:outfit-poll <question>` | Committable markdown poll of options + rationale per option |
| `/cowork:skill-diff` | Diff skill files against their conventions |
| `/cowork:share-config` | Snapshot current wardrobe/watch config |

## Agents

- `style-partner` — independent reviewer for outfit / watch / skill-edit diffs. Gives a yes/no + one-reason verdict plus concrete revisions.
