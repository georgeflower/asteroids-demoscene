

# Plan: Add Session Token to High Scores & Detect Stagnant Checkpoints

## Summary

Two changes: (1) store the `session_token` on each high score for traceability, and (2) add server-side detection for suspicious checkpoint patterns like duplicate scores and stagnant metrics within a session.

## Observations from the CSV

- Session `fc852d9a`: score `11220` reported twice (lines 4-5), `asteroids_destroyed` stuck at `100`, `bullets_fired` stuck at `223` — player idle or paused, metrics frozen.
- Session `d07339fe`: `asteroids_destroyed` stuck at `476` for two consecutive heartbeats (lines 21-22) while score still climbed — suspicious.
- Sessions `af20d77a` and `3df0f0f7` (lines 25-28): identical checkpoint patterns (100→200, 5→10 asteroids, 20→40 bullets) — likely same person using different sessions (the attacker's test runs).

## Changes

### 1. Database Migration — Add `session_token` column to `current_high_scores`

```sql
ALTER TABLE public.current_high_scores 
  ADD COLUMN session_token text;
```

### 2. Update `insert_score_with_audit` function

Modify the function to also store the session token on the score row:

```sql
CREATE OR REPLACE FUNCTION public.insert_score_with_audit(...)
  -- add session_token to the INSERT into current_high_scores
```

### 3. Edge Function — Detect stagnant/duplicate checkpoints

Add validation in `handleSubmit` before accepting a score:

- **Duplicate score detection**: If consecutive checkpoints have identical `score` values, flag as suspicious (player paused or replaying cached data).
- **Stagnant metrics detection**: If `asteroids_destroyed` or `bullets_fired` remain unchanged across 2+ consecutive heartbeats while score increases, reject or flag.
- **Cross-session pattern detection**: Before accepting, check if another session in the last 30 minutes has an identical checkpoint fingerprint (same score sequence pattern).

### 4. Files Changed

| File | Change |
|------|--------|
| Migration SQL | Add `session_token` column to `current_high_scores` |
| Migration SQL | Update `insert_score_with_audit` to store session_token |
| `supabase/functions/submit/index.ts` | Add stagnant checkpoint + duplicate score detection logic |

