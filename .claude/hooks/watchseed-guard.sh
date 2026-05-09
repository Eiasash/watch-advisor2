#!/bin/bash
# PreToolUse hook: block edits to data/watchSeed.js
#
# CLAUDE.md states: "watchSeed.js is immutable. Never touch it."
# Enforced at write time. To intentionally override, temporarily disable
# the PreToolUse hook entry in .claude/settings.json.

set -eu

INPUT=$(cat)

echo "$INPUT" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
fp = (d.get("tool_input") or {}).get("file_path") or ""
if fp.endswith("data/watchSeed.js") or fp == "data/watchSeed.js":
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "data/watchSeed.js is documented as immutable in CLAUDE.md (Sacred. NEVER REPLACE.). If this edit is intentional, temporarily disable the watchseed-guard hook or work in a different file."
        }
    }))
'
