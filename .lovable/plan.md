

# Fix: White Screen on Published Game — Missing Environment Variables

## Root Cause

PR #52 removed the `.env` file from the repository to "protect credentials." However, the `VITE_*` variables in that file are **public client-side values** that Vite must bundle at build time. Without them, `createClient()` throws `Error: supabaseUrl is required.` and the app crashes to a white screen.

The preview environment works because Lovable auto-injects these variables. The published build does not have this injection — it relies on the `.env` file being present in the repo.

## Fix

Restore the `.env` file with the three public variables. These are not secrets — the anon key is a public identifier designed to be shipped in browser code, and RLS + the edge function provide the actual security layer.

### Step 1: Restore `.env` file

Re-create the `.env` file with the original contents:

```env
VITE_SUPABASE_PROJECT_ID="ctrucihctxgwzprpaylb"
VITE_SUPABASE_PUBLISHABLE_KEY="<your-supabase-anon-key>"
VITE_SUPABASE_URL="https://ctrucihctxgwzprpaylb.supabase.co"
```

This file is auto-managed by Lovable Cloud and should not be manually edited or removed.

### Files changed
- `.env` — restore the three `VITE_*` environment variables

## Why this is safe

The anon key is a public API key. It ships in every browser bundle. Security comes from:
- RLS policies restricting what the `anon` role can do
- The `REVOKE EXECUTE` migration we applied (blocking direct RPC calls)
- The edge function using the private service role key for privileged operations

