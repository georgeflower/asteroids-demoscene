

# Deep Analysis: AZZ Score Injection & Security Hardening

## Forensic Findings

The AZZ score (313,390) was submitted through the edge function — it has a valid audit log with `submission_method: edge_function`. Here is what reveals it as fraudulent:

| Field | AZZ (fake) | MBD (legit, best) |
|---|---|---|
| Level | 60 | 7 |
| Time played | 3600s (exactly 1 hour — the cap) | 260–420s |
| Score/sec | 87 pts/s | 138–203 pts/s |
| Source | game_client | game_client |

The attacker exploited the **cold-start fallback** in the edge function. When the in-memory session map is empty after a cold start, any valid UUID is auto-recreated as a session, and the server trusts the **client-reported `timePlayedSeconds`**. The attacker sent `timePlayedSeconds: 3600` (the max cap), `level: 60`, `score: 313390` — all passing the loose plausibility checks.

No edge function logs exist for this submission (logs rotated), confirming it happened during/after a cold start.

## Root Cause: In-Memory Sessions

The core problem is that game sessions live only in edge function memory. On cold start, they vanish, and the fallback trusts client data. This is the single biggest vulnerability.

## Plan: 4 Hardening Measures

### 1. Store sessions in database (eliminates cold-start exploit)
- Create a `game_sessions` table with `token`, `started_at`, `submission_count`, `last_submission_at`
- On `/start-session`: INSERT a row instead of using in-memory Map
- On `/submit`: SELECT the session row, validate against `started_at` (server time, unforgeable)
- Calculate `time_played_seconds` as `now() - started_at` — always server-side, never trust client
- **Remove the cold-start fallback entirely**
- RLS: no public access (only service_role via edge function)

### 2. Tighten plausibility checks
- Cap max level at 30 (no one has reached past 7 legitimately)
- Reduce `MAX_SCORE_PER_SECOND` from 200 to 150
- Add a **max total score cap** of 500,000 (current legit max is ~116k)
- These can be loosened later as gameplay evolves

### 3. Validate request origin
- Check `Origin` and `Referer` headers against allowed domains
- Reject requests not from the game's domain (blocks curl/Postman attacks)
- Not foolproof (headers can be spoofed from browser extensions) but raises the bar

### 4. Delete the fraudulent AZZ score
- Run a migration to DELETE the specific score by ID
- Also delete its audit log entry

## What stays the same (won't break)
- The public SELECT policy on `current_high_scores` (needed for leaderboard display)
- The `insert_score_with_audit` RPC function
- The client-side submission flow in Game.tsx (only `timePlayedSeconds` becomes advisory/ignored)
- The profanity filter, rate limiting, duplicate detection

## Technical details

### New table
```sql
CREATE TABLE game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  submission_count int NOT NULL DEFAULT 0,
  last_submission_at timestamptz,
  expired boolean NOT NULL DEFAULT false
);
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
-- No public policies = only service_role can access
```

### Edge function changes
- Replace `gameSessions` Map with DB queries
- Remove `session.recreated` / cold-start fallback
- Calculate elapsed time as `now() - session.started_at` (DB server time)
- Add origin header check
- Tighten constants

### Files modified
- `supabase/functions/submit/index.ts` — session DB logic, origin check, tighter limits
- `src/pages/Game.tsx` — no changes needed (client flow unchanged)
- Database migration — new table + delete AZZ score

