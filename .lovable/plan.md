

# Plan: Server-Side Session State & Delta Validation Hardening

## Current State

Most of what the user requested is **already implemented**:
- ✅ RLS on both `current_high_scores` and `high_scores` — SELECT only, no client writes
- ✅ `game_sessions` table with token, PoW, HMAC nonce, expiry, submission_count
- ✅ Heartbeat HMAC covers all fields, seq monotonicity enforced
- ✅ PoW verification on submit
- ✅ Single-submission-per-session enforcement
- ✅ Origin/Referer validation, entropy checks, burst detection

**What's missing** (the real gaps):

1. **No server-authoritative session state** — heartbeat validation queries `game_session_checkpoints` table each time instead of storing last-known values directly in `game_sessions`. This means an extra DB query per heartbeat and no per-minute rate limiting.

2. **No delta-per-second validation** — heartbeats check monotonicity but don't enforce `scoreDelta <= MAX_SCORE_PER_SEC × dtSec`.

3. **Submit doesn't verify `finalScore ≤ last_score`** — the submit handler checks against checkpoints but doesn't enforce that the submitted score matches the last heartbeat's score.

4. **No minimum-heartbeat requirement on submit** — low scores can submit without any heartbeats.

## Changes

### 1. Database Migration — Add session state columns to `game_sessions`

Add columns to existing `game_sessions` table:
```sql
ALTER TABLE game_sessions ADD COLUMN last_heartbeat_at timestamptz;
ALTER TABLE game_sessions ADD COLUMN last_seq integer DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN last_score integer DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN last_level integer DEFAULT 1;
ALTER TABLE game_sessions ADD COLUMN last_asteroids integer DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN last_bullets integer DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN heartbeat_count_minute integer DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN heartbeat_window_start timestamptz;
```

No new table needed — extend existing `game_sessions`.

### 2. Edge Function — Rewrite `handleHeartbeat` with delta validation

Replace checkpoint-query approach with session-state approach:

- Read session row (already done) — now includes `last_score`, `last_level`, etc.
- **Rate limit**: if `heartbeat_window_start` is within current minute, check `heartbeat_count_minute < 6` (max 6 per minute for 30s intervals). Reset window if minute elapsed.
- **Timing**: reject if `now - last_heartbeat_at < 5s`
- **Seq**: enforce `payload.seq > session.last_seq`
- **Delta validation** (the core new logic):
  - `dtSec = (now - last_heartbeat_at) / 1000`
  - `scoreDelta = score - last_score` must be `≥ 0` and `≤ MAX_SCORE_PER_SEC × dtSec`
  - `asteroidsDelta = l - last_asteroids` must be `≥ 0` and `≤ MAX_ASTEROIDS_PER_SEC × dtSec`
  - `bulletsDelta = u - last_bullets` must be `≥ 0` and `≤ MAX_BULLETS_PER_SEC × dtSec`
  - Level cannot decrease; max level jump = 5
- **Update session**: set `last_heartbeat_at`, `last_seq`, `last_score`, `last_level`, `last_asteroids`, `last_bullets`, increment `heartbeat_count_minute`
- Still insert into `game_session_checkpoints` for audit trail

**Threshold values** (generous for Asteroids):
| Constant | Value | Rationale |
|----------|-------|-----------|
| `MAX_SCORE_PER_SEC` | 1000 | Wave 8+ with 2x multiplier: ~32k/wave ÷ ~45s ≈ 700/s. 1000 is generous. |
| `MAX_ASTEROIDS_PER_SEC` | 5 | Max ~20 asteroids/wave × 7 fragments = 140 total; killing 5/s is very fast |
| `MAX_BULLETS_PER_SEC` | 10 | Rapid-fire powerup allows ~6-8 shots/s |
| `MAX_HEARTBEATS_PER_MINUTE` | 6 | Client sends every 30s; 6/min allows some jitter |
| `MIN_HEARTBEAT_GAP_MS` | 5000 | Absolute floor between heartbeats |

### 3. Edge Function — Tighten `handleSubmit`

- **Require `last_heartbeat_at` exists** (at least 1 heartbeat)
- **Enforce `finalScore ≤ last_score + (dtSinceLastHeartbeat × MAX_SCORE_PER_SEC)`**
- **Enforce `finalScore == last_score` for scores > 50k** (high scores must match last heartbeat exactly)

### 4. No client changes needed

The client already sends `gameSessionToken`, `score`, `level`, `asteroidsDestroyed`, `bulletsFired`, `hmac`, `seq` in heartbeats, and the submit payload is already correct. No frontend changes required.

## Files Changed

| File | Change |
|------|--------|
| **Migration SQL** | Add 8 columns to `game_sessions` |
| `supabase/functions/submit/index.ts` | Rewrite heartbeat to use session-state delta validation; tighten submit to enforce `finalScore ≤ last_score` |

## Verification Checklist (post-deploy)

- [ ] `INSERT INTO current_high_scores ...` via anon key → permission denied
- [ ] `INSERT INTO high_scores ...` via anon key → permission denied
- [ ] Heartbeat with `seq ≤ last_seq` → rejected (replay)
- [ ] Heartbeat with `scoreDelta > MAX_SCORE_PER_SEC × dt` → rejected (delta)
- [ ] Heartbeat arriving < 5s after previous → rejected (rate limit)
- [ ] Submit with `score > last_score` → rejected (final score mismatch)
- [ ] Submit without any heartbeats → rejected
- [ ] Duplicate submit on same session → rejected (session expired)
- [ ] Normal gameplay → works without false positives

