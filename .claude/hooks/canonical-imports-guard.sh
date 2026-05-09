#!/bin/bash
# PreToolUse hook: prevent inline definitions of canonical scoring constants.
#
# Per audit-fix-deploy skill A.1:
#   DIAL_COLOR_MAP must only be defined in src/data/dialColorMap.js
#   SCORE_WEIGHTS / SCORE_CEILING only in src/config/scoringWeights.js
#
# Inlining elsewhere causes silent drift between scoring sites and
# breaks the single-source-of-truth invariant. Catches at write time.

set -eu

INPUT=$(cat)

echo "$INPUT" | python3 -c '
import sys, json, re
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)

ti = d.get("tool_input") or {}
fp = ti.get("file_path") or ""
content = ti.get("content") or ti.get("new_string") or ""

# Skip the canonical files themselves — they SHOULD define these.
if fp.endswith("src/data/dialColorMap.js") or fp == "src/data/dialColorMap.js":
    sys.exit(0)
if fp.endswith("src/config/scoringWeights.js") or fp == "src/config/scoringWeights.js":
    sys.exit(0)

# Match top-level const declarations only — avoids false positives on
# comments / test fixtures / imports that just mention the name.
pattern = re.compile(r"^\s*const\s+(DIAL_COLOR_MAP|SCORE_WEIGHTS|SCORE_CEILING)\s*=", re.MULTILINE)
if pattern.search(content):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "DIAL_COLOR_MAP must only be defined in src/data/dialColorMap.js; SCORE_WEIGHTS/SCORE_CEILING only in src/config/scoringWeights.js. Import the canonical source instead of inlining (audit-fix-deploy skill A.1 invariant)."
        }
    }))
'
