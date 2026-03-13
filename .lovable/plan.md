

# Fix: Move Session Tokens to Separate Non-Public Table

## Problem
The `current_high_scores` table has a public SELECT policy, exposing `session_token` values to anyone.

## Solution
1. **Create a new `score_audit_log` table** with columns: `id`, `score_id` (FK to current_high_scores), `session_token`, `submission_method`, `created_at`. No public SELECT policy — only service_role can read it.

2. **Drop `session_token` and `submission_method` columns** from `current_high_scores`.

3. **Update Edge Function** (`supabase/functions/submit/index.ts`): After inserting into `current_high_scores`, insert the session token and submission method into `score_audit_log` using the returned score ID.

4. **Update client code** (`src/pages/Game.tsx`): No changes needed — client doesn't read these columns.

5. **Update admin scripts** (`scripts/check-highscore-legitimacy.mjs`, `scripts/check-highscore-legitimacy.ts`): Query `score_audit_log` joined with `current_high_scores` instead of reading tokens directly from the scores table.

### Migration SQL
```sql
-- Create audit table (no public access)
CREATE TABLE public.score_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id uuid NOT NULL REFERENCES public.current_high_scores(id) ON DELETE CASCADE,
  session_token text,
  submission_method text DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.score_audit_log ENABLE ROW LEVEL SECURITY;
-- No public SELECT policy = not readable by anon/authenticated

-- Remove exposed columns
ALTER TABLE public.current_high_scores DROP COLUMN IF EXISTS session_token;
ALTER TABLE public.current_high_scores DROP COLUMN IF EXISTS submission_method;
```

