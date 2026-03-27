#!/usr/bin/env bash
# scripts/audit-credentials.sh
# Automated credential audit for asteroids-demoscene
# Scans git history and working tree for exposed secrets.
#
# Usage:
#   bash scripts/audit-credentials.sh [--full] [--recent N]
#
# Options:
#   --full       Scan complete git history (default)
#   --recent N   Scan only the last N commits

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FULL_SCAN=true
RECENT_COMMITS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)    FULL_SCAN=true; shift ;;
    --recent)  FULL_SCAN=false; RECENT_COMMITS="$2"; shift 2 ;;
    *)         echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

FOUND_ISSUES=0

header() { echo ""; echo "=== $* ==="; }
ok()     { echo "  ✅  $*"; }
warn()   { echo "  ⚠️   $*"; FOUND_ISSUES=$((FOUND_ISSUES + 1)); }
info()   { echo "  ℹ️   $*"; }

header "Asteroids Demoscene — Credential Audit"
echo "Repo: $REPO_ROOT"
echo "Date: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "Mode: $([ "$FULL_SCAN" = true ] && echo 'full history' || echo "last $RECENT_COMMITS commits")"

# ──────────────────────────────────────────────
# 1. Check .gitignore covers secret files
# ──────────────────────────────────────────────
header "1. .gitignore Coverage"
for pattern in '\.env$' '\.env\.local' '\.env\.production'; do
  if grep -qE "$pattern" .gitignore 2>/dev/null; then
    ok ".gitignore covers pattern: $pattern"
  else
    warn ".gitignore is MISSING pattern: $pattern"
  fi
done

# ──────────────────────────────────────────────
# 2. Verify .env files not tracked
# ──────────────────────────────────────────────
header "2. Tracked .env Files"
TRACKED_ENV=$(git ls-files | grep -E '^\.env(\.|$)' | grep -v '\.example$' | grep -v '\.sample$' || true)
if [ -z "$TRACKED_ENV" ]; then
  ok "No .env files (excluding .example/.sample) are tracked by git"
else
  warn "The following .env files ARE tracked — remove them immediately:"
  echo "$TRACKED_ENV" | sed 's/^/    /'
fi

# ──────────────────────────────────────────────
# 3. Scan git history for SUPABASE_SERVICE_ROLE_KEY
# ──────────────────────────────────────────────
header "3. SUPABASE_SERVICE_ROLE_KEY in History"
LOG_RANGE="--all"
[ "$FULL_SCAN" = false ] && LOG_RANGE="-$RECENT_COMMITS"
MATCHES=$(git log $LOG_RANGE -p --follow -- '*.ts' '*.tsx' '*.js' '*.mjs' '*.json' '*.env' \
  2>/dev/null | grep -i 'SUPABASE_SERVICE_ROLE_KEY' || true)
if [ -z "$MATCHES" ]; then
  ok "No SUPABASE_SERVICE_ROLE_KEY found in history"
else
  warn "SUPABASE_SERVICE_ROLE_KEY references found in history:"
  echo "$MATCHES" | head -20 | sed 's/^/    /'
fi

# ──────────────────────────────────────────────
# 4. Scan for VITE_SCORE_HMAC_SECRET hardcoded values
# ──────────────────────────────────────────────
header "4. VITE_SCORE_HMAC_SECRET Hardcoded Values"
# Look for assignments with actual values (not env-var references like $VAR or import.meta.env)
# Pattern: var=value where value doesn't start with $, {, or a quote (template/reference)
HMAC_PATTERN='VITE_SCORE_HMAC_SECRET\s*=\s*[0-9a-fA-F]{16,}'
HMAC_HITS=$(git log $LOG_RANGE -p -- '*.ts' '*.tsx' '*.js' '*.mjs' \
  2>/dev/null \
  | grep -E "$HMAC_PATTERN" || true)
if [ -z "$HMAC_HITS" ]; then
  ok "No hardcoded VITE_SCORE_HMAC_SECRET values found"
else
  warn "Potential hardcoded HMAC secret found:"
  echo "$HMAC_HITS" | sed 's/^/    /'
fi

# ──────────────────────────────────────────────
# 5. Check for API tokens / bearer tokens in source
# ──────────────────────────────────────────────
header "5. Bearer Tokens / API Keys in Source"
BEARER=$(grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -E 'Bearer [A-Za-z0-9+/=_-]{20,}' src/ supabase/ 2>/dev/null || true)
if [ -z "$BEARER" ]; then
  ok "No hardcoded Bearer tokens found in src/ or supabase/"
else
  warn "Hardcoded Bearer tokens found:"
  echo "$BEARER" | sed 's/^/    /'
fi

# ──────────────────────────────────────────────
# 6. Check for private key files
# ──────────────────────────────────────────────
header "6. Private Key Files"
PEM_FILES=$(find . -not -path './node_modules/*' -not -path './.git/*' \
  \( -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' \) 2>/dev/null || true)
if [ -z "$PEM_FILES" ]; then
  ok "No private key files found in working tree"
else
  warn "Private key files found:"
  echo "$PEM_FILES" | sed 's/^/    /'
fi

# ──────────────────────────────────────────────
# 7. Scan for high-entropy hex strings (potential raw secrets)
# ──────────────────────────────────────────────
header "7. High-Entropy Hex Strings (>= 40 chars)"
HEX=$(grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -E "[\"'][0-9a-f]{40,}[\"']" src/ supabase/ 2>/dev/null | grep -v node_modules || true)
if [ -z "$HEX" ]; then
  ok "No suspicious high-entropy hex strings found in source"
else
  warn "Potential secrets (high-entropy hex) found:"
  echo "$HEX" | head -20 | sed 's/^/    /'
fi

# ──────────────────────────────────────────────
# 8. Verify GitHub Actions secrets are not in workflow files
# ──────────────────────────────────────────────
header "8. GitHub Actions Workflow Files"
if [ -d ".github/workflows" ]; then
  HARDCODED=$(grep -rn --include='*.yml' --include='*.yaml' \
    -E '(password|secret|key|token)\s*:\s*[^\s$"'"'"'{][^\s]{8,}' \
    .github/workflows/ 2>/dev/null | grep -v '\${{' || true)
  if [ -z "$HARDCODED" ]; then
    ok "No hardcoded credentials found in workflow files"
  else
    warn "Potential hardcoded credentials in workflow files:"
    echo "$HARDCODED" | sed 's/^/    /'
  fi
else
  info "No .github/workflows directory found"
fi

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
header "Summary"
if [ "$FOUND_ISSUES" -eq 0 ]; then
  echo "  ✅  All checks passed — no credential issues found."
  exit 0
else
  echo "  ⚠️   $FOUND_ISSUES issue(s) found. Review the warnings above."
  exit 1
fi
