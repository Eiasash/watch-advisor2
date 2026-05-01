#!/usr/bin/env bash
# verify-deploy.sh — Post-deploy live verification.
#
# Curls the live Netlify URL, extracts the main JS bundle reference from
# index.html, and confirms the expected version string appears in the
# deployed bundle. Polls with backoff because Netlify takes ~30–90s to
# publish after push.
#
# Why: existing tests validate LOCAL files. This validates the LIVE site
# actually shipped the new version — catches the "deploy silently failed"
# and "CDN cache served stale assets" cases.
#
# Live marker:
#   The package.json version is injected by vite.config.js as
#   __BUILD_NUMBER__ (see `define:` block) and rendered into the JS
#   bundle as a literal string (e.g. "1.12.42"). It surfaces in
#   Header.jsx and SettingsPanel.jsx. The bundle filename is
#   content-hashed, so we discover it from index.html each poll.
#
# Usage:
#   ./scripts/verify-deploy.sh                # uses package.json version
#   ./scripts/verify-deploy.sh 1.12.42        # explicit version
#   ./scripts/verify-deploy.sh --wait 180     # max wait seconds (default 120)
#   ./scripts/verify-deploy.sh --no-wait      # one-shot check, no polling
#
# Exit codes:
#   0 — live JS bundle contains the expected version string
#   1 — version mismatch after wait window (or no marker found)
#   2 — usage error or network failure

set -u

LIVE_HOST='https://watch-advisor2.netlify.app'
LIVE_HTML="${LIVE_HOST}/"
WAIT_MAX=120
INTERVAL=10
ONESHOT=0
VERSION=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wait) WAIT_MAX="$2"; shift 2;;
    --no-wait) ONESHOT=1; shift;;
    -h|--help) sed -n '1,32p' "$0"; exit 0;;
    -*) echo "verify-deploy: unknown flag $1" >&2; exit 2;;
    *) VERSION="$1"; shift;;
  esac
done

if [[ -z "$VERSION" ]]; then
  if ! VERSION=$(node -p "require('./package.json').version" 2>/dev/null); then
    echo "verify-deploy: cannot read package.json version" >&2
    exit 2
  fi
fi

echo "verify-deploy: expecting v${VERSION}"
echo "  HTML: ${LIVE_HTML}"

start=$(date +%s)
while true; do
  html_ok=0
  bundle_ok=0
  bundle_url=''

  html_body=$(curl -sf -A 'Mozilla/5.0 verify-deploy' --max-time 15 "${LIVE_HTML}" || true)

  if [[ -n "$html_body" ]]; then
    html_ok=1
    # Extract the main module bundle path: /assets/index-<hash>.js
    bundle_path=$(printf '%s' "$html_body" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
    if [[ -n "$bundle_path" ]]; then
      bundle_url="${LIVE_HOST}${bundle_path}"
      bundle_body=$(curl -sf -A 'Mozilla/5.0 verify-deploy' --max-time 30 "${bundle_url}" || true)
      if [[ -n "$bundle_body" ]] && printf '%s' "$bundle_body" | grep -qF "\"${VERSION}\""; then
        bundle_ok=1
      fi
    fi
  fi

  if [[ "$html_ok" = 1 && "$bundle_ok" = 1 ]]; then
    elapsed=$(( $(date +%s) - start ))
    echo "  HTML reachable                       PASS"
    echo "  BUNDLE ${bundle_url##*/} contains \"${VERSION}\"  PASS"
    echo "verify-deploy: PASS (after ${elapsed}s)"
    exit 0
  fi

  elapsed=$(( $(date +%s) - start ))
  if [[ "$ONESHOT" = 1 ]] || (( elapsed >= WAIT_MAX )); then
    echo ""
    echo "verify-deploy: FAIL after ${elapsed}s"
    [[ "$html_ok" = 0 ]] && echo "  ✗ live HTML unreachable at ${LIVE_HTML}"
    if [[ "$html_ok" = 1 && -z "$bundle_url" ]]; then
      echo "  ✗ no /assets/index-<hash>.js reference found in live HTML"
    elif [[ "$bundle_ok" = 0 && -n "$bundle_url" ]]; then
      echo "  ✗ live bundle ${bundle_url} missing \"${VERSION}\""
    fi
    echo ""
    echo "Possible causes:"
    echo "  - Netlify still building — wait 30s, retry"
    echo "  - Push didn't land on main"
    echo "  - vite.config.js __BUILD_NUMBER__ define dropped"
    echo "  - CDN cache — try cache-busted URL: ${LIVE_HTML}?v=${VERSION}"
    exit 1
  fi

  echo "  ...polling (html=${html_ok} bundle=${bundle_ok}, ${elapsed}s/${WAIT_MAX}s) — sleeping ${INTERVAL}s"
  sleep "$INTERVAL"
done
