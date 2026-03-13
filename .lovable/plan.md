

# Fix: Remove Public INSERT Policy on `current_high_scores`

## Problem
The `current_high_scores` table still has a public INSERT policy (`"Insert current high scores with validation"`), allowing anyone to insert scores directly via the client SDK, bypassing the Edge Function's anti-cheat validation entirely.

## Solution
Drop the public INSERT policy. The Edge Function already uses the service role key (which bypasses RLS), so legitimate submissions will continue to work. No code changes needed — just a single database migration.

### Migration SQL
```sql
DROP POLICY IF EXISTS "Insert current high scores with validation" ON public.current_high_scores;
```

After this, only the Edge Function (via service_role) can insert scores. Direct client-side inserts will be blocked by RLS.

