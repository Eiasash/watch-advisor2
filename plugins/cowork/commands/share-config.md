---
description: Snapshot current wardrobe/watch config as a pasteable markdown block for another session
---

1. If Supabase env is configured (see `.env.example`), read the active user's wardrobe + watch rows. If not, read the fallback static config from `Watch_Collection_v10.md`.
2. Render a compact markdown snapshot: grouped by category, one line per item with the keys another session would need to resume (id, name, dress-code tag).
3. Write to `.cowork/snapshots/<timestamp>.md`. Commit with `cowork: snapshot`. Don't push.
4. Print the path. Tell the user they can paste this into a fresh session's first prompt.
