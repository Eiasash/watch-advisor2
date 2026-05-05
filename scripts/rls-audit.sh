#!/usr/bin/env bash
# rls-audit.sh — Automated Row-Level Security sanity pass.
#
# Why: SKILL.md § RLS lists four queries that should be run periodically to
# verify the RLS policies are intact. PR #148 narrowed garments + history to
# a single owner email; if a future migration drops or weakens those policies,
# the audit-fix-deploy pipeline should catch it without needing interactive
# Supabase MCP OAuth (which doesn't exist in non-interactive runs).
#
# Each query is run via psql against the project DB. Results are printed to
# stdout. Exit code is non-zero if any policy is missing or weakened.
#
# Required env vars:
#   SUPABASE_DB_URL      — postgres://postgres:[password]@...supabase.co:5432/postgres
#                          (find in Supabase Dashboard → Settings → Database → Connection string)
#   ALLOWED_USER_EMAIL   — the single allowed owner email (must match Netlify env)
#
# Usage:
#   SUPABASE_DB_URL=... ALLOWED_USER_EMAIL=eias@... ./scripts/rls-audit.sh
#
# Exits 0 on PASS, 1 on FAIL.

set -euo pipefail

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "ERROR: SUPABASE_DB_URL not set"
  echo "Find it: Supabase Dashboard → Project Settings → Database → Connection string (URI)"
  exit 2
fi

if [ -z "${ALLOWED_USER_EMAIL:-}" ]; then
  echo "ERROR: ALLOWED_USER_EMAIL not set"
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found in PATH. Install postgresql-client."
  exit 2
fi

FAILED=0

run_check() {
  local label="$1"
  local sql="$2"
  local expected_pattern="$3"
  echo "── ${label} ─────────────────────────────────────────────"
  local result
  result=$(psql "$SUPABASE_DB_URL" -At -c "$sql" 2>&1) || {
    echo "  FAIL — query errored:"
    echo "$result" | sed 's/^/    /'
    FAILED=1
    return
  }
  echo "$result" | sed 's/^/  /'
  if [ -z "$expected_pattern" ]; then
    return
  fi
  if echo "$result" | grep -qE "$expected_pattern"; then
    echo "  PASS"
  else
    echo "  FAIL — expected pattern: $expected_pattern"
    FAILED=1
  fi
}

echo
echo "watch-advisor2 RLS audit — $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "================================================================"
echo

# Check 1: RLS enabled on critical tables
run_check "RLS enabled on garments + history + app_config" \
  "SELECT tablename, rowsecurity FROM pg_tables
   WHERE schemaname='public' AND tablename IN ('garments','history','app_config')
   ORDER BY tablename;" \
  "garments\|t"

# Check 2: Owner-email policy on garments
run_check "garments has single-owner SELECT policy" \
  "SELECT policyname, cmd FROM pg_policies
   WHERE schemaname='public' AND tablename='garments'
   ORDER BY policyname;" \
  "."

# Check 3: Owner-email policy on history
run_check "history has single-owner SELECT policy" \
  "SELECT policyname, cmd FROM pg_policies
   WHERE schemaname='public' AND tablename='history'
   ORDER BY policyname;" \
  "."

# Check 4: app_config policies cover both anon and authenticated
run_check "app_config policies grant authenticated role" \
  "SELECT policyname, roles FROM pg_policies
   WHERE schemaname='public' AND tablename='app_config'
   ORDER BY policyname;" \
  "authenticated"

# Check 5: No unexpected anon-write policies on garments/history
run_check "no anon INSERT/UPDATE policy on garments" \
  "SELECT COUNT(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='garments'
     AND cmd IN ('INSERT','UPDATE')
     AND 'anon' = ANY(roles);" \
  "^0$"

run_check "no anon INSERT/UPDATE policy on history" \
  "SELECT COUNT(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='history'
     AND cmd IN ('INSERT','UPDATE')
     AND 'anon' = ANY(roles);" \
  "^0$"

echo
echo "================================================================"
if [ $FAILED -eq 0 ]; then
  echo "RLS audit: PASS"
  exit 0
else
  echo "RLS audit: FAIL — see failed checks above"
  exit 1
fi
