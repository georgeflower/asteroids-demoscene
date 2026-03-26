#!/usr/bin/env bash
# rotate-hmac-secret.sh — Rotate the ADMIN_SECRET_KEY used to authenticate
# the admin dashboard. Generates a new key, updates Supabase secrets, and
# redeploys the Edge Function.
#
# Usage:
#   chmod +x scripts/rotate-hmac-secret.sh
#   ./scripts/rotate-hmac-secret.sh
#
# Prerequisites:
#   - Supabase CLI installed and authenticated (supabase login)
#   - Project linked (supabase link --project-ref <ref>)

set -euo pipefail

echo "🔑 Admin Key Rotation"
echo "====================="

# Generate a new 64-character hex key
NEW_KEY=$(openssl rand -hex 32)

echo ""
echo "New key generated (first 8 chars): ${NEW_KEY:0:8}..."
echo ""

echo "Step 1/3: Setting ADMIN_SECRET_KEY in Supabase secrets..."
supabase secrets set "ADMIN_SECRET_KEY=${NEW_KEY}"
echo "         ✓ Done"

echo "Step 2/3: Redeploying Edge Function 'submit'..."
supabase functions deploy submit
echo "         ✓ Done"

echo "Step 3/3: Invalidating all existing admin sessions..."
echo "         Run this SQL in the Supabase SQL editor:"
echo "           UPDATE admin_sessions SET invalidated = true WHERE invalidated = false;"
echo ""

echo "✅ Rotation complete."
echo ""
echo "   All admins must re-authenticate in the Admin Monitor dashboard."
echo "   Admin sessions expire automatically after 1 hour, or sooner with"
echo "   the SQL command above."

