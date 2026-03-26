

# Migrate Backend from Lovable Cloud to External Supabase

## Overview

Move the entire backend (database schema, functions, RLS policies, data, and secrets) from Lovable Cloud (`ctrucihctxgwzprpaylb`) to your self-managed Supabase project (`octtiovyulpcikcnpfwb`), then point the frontend at the new project.

## Important Caveat

Lovable Cloud **cannot be disconnected** once enabled. After migration, the old Cloud backend will still exist but will no longer be used. The app will point entirely at your new Supabase project.

## Steps

### 1. Set up the new Supabase project schema

Apply all 14 migration files from `supabase/migrations/` to the new project. You can do this via:
- Supabase Dashboard → SQL Editor: paste each migration in chronological order
- Or link the project locally with `supabase link --project-ref octtiovyulpcikcnpfwb` and run `supabase db push`

### 2. Export and import data

Export data from the current tables (`current_high_scores`, `high_scores`, `score_audit_log`, `game_sessions`, `game_session_checkpoints`) using psql/CSV export, then import into the new project.

### 3. Deploy Edge Functions to the new project

Deploy the two edge functions (`submit` and `scenestream-proxy`) to the new project:
```bash
supabase functions deploy submit --project-ref octtiovyulpcikcnpfwb
supabase functions deploy scenestream-proxy --project-ref octtiovyulpcikcnpfwb
```

### 4. Configure secrets on the new project

Set these secrets on the new Supabase project:
- `ADMIN_SECRET_KEY` — same value as current
- `SUPABASE_SERVICE_ROLE_KEY` — the new project's service role key (auto-set by Supabase)
- `SUPABASE_URL` — the new project's URL (auto-set)

### 5. Update the frontend `.env` file

Change the three `VITE_*` variables to point at the new project:

```env
VITE_SUPABASE_PROJECT_ID="octtiovyulpcikcnpfwb"
VITE_SUPABASE_PUBLISHABLE_KEY="<new project's anon key>"
VITE_SUPABASE_URL="https://octtiovyulpcikcnpfwb.supabase.co"
```

### 6. Update allowed origins in the Edge Function

In `supabase/functions/submit/index.ts`, update `ALLOWED_ORIGINS` to include any new domain if you're hosting on a custom domain. The current Lovable URLs should remain if you're still publishing through Lovable.

### 7. Publish

Re-publish the frontend so it bundles the new environment variables.

## Files Changed
- `.env` — update all three `VITE_*` values to the new Supabase project
- `supabase/functions/submit/index.ts` — update `ALLOWED_ORIGINS` if needed

## What I Need From You

Before I can implement this, I need:
1. **The anon (publishable) key** from your new Supabase project (`octtiovyulpcikcnpfwb`) — found in Settings → API
2. **The `ADMIN_SECRET_KEY` value** you want to use on the new project (can be the same as current)
3. Confirmation that you've applied the migrations and deployed edge functions to the new project (this must be done from the Supabase dashboard or CLI — Lovable can only update the frontend code)

