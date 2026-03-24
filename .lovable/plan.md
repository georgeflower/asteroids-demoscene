

# Server-Side Score Progression Validation

## Problem
Currently, the server only sees a single final submission. An attacker starts a session, waits, then sends a fabricated score in one request. There's no way to distinguish this from real gameplay.

## Solution: Gameplay Heartbeats
During actual gameplay, the client periodically sends score checkpoints to the server (every ~30 seconds). At submission time, the server validates that:
- Checkpoints were received throughout the session
- The final score aligns with the last checkpoint (no sudden jumps)
- Score progression looks reasonable (monotonically increasing, no huge gaps)

An attacker would need to fake an entire timeline of believable incremental updates — significantly harder than forging one final number.

## Architecture

```text
Game Start → /start-session → token
   ↓
Every ~30s → /heartbeat { token, score, level, timestamp }
   ↓                Server stores checkpoint in game_session_checkpoints
   ↓
Game Over → /submit { token, score, level }
   ↓
   Server checks:
   1. At least N checkpoints exist for this session
   2. Final score ≤ last checkpoint + reasonable delta
   3. Score increased monotonically across checkpoints
   4. No checkpoint gaps > 60 seconds
```

## Plan

### 1. New database table: `game_session_checkpoints`
- `id`, `session_token`, `score`, `level`, `reported_at` (server timestamp)
- No RLS needed (only accessed via edge function with service role)

### 2. New endpoint in `supabase/functions/submit/index.ts`: `/heartbeat`
- Accepts `{ gameSessionToken, score, level }`
- Validates session exists and isn't expired
- Inserts a checkpoint row with server-side timestamp
- Rate-limited to one per 15 seconds (reject faster calls)

### 3. Update `/submit` endpoint validation
- Query checkpoints for this session token
- Require minimum 2 checkpoints for scores above a threshold (e.g., 50,000+)
- Reject if final score exceeds last checkpoint by more than `MAX_SCORE_PER_SECOND * seconds_since_last_checkpoint`
- Reject if any checkpoint gap exceeds 90 seconds (player would have been playing but not reporting)

### 4. Update `src/pages/Game.tsx`
- Add a `setInterval` (~30s) during active gameplay that calls the heartbeat endpoint with current score and level
- Clear interval on game over / pause
- Non-blocking: if a heartbeat fails, gameplay continues (don't break UX)

### 5. Cleanup
- Extend `cleanup_old_sessions` DB function to also delete old checkpoints
- Or add `ON DELETE CASCADE` from game_sessions to checkpoints

## Why this works
- A real player generates 10-20+ checkpoints per game showing gradual score increase
- An attacker sitting idle generates zero checkpoints, then submits a big score → rejected
- Faking checkpoints requires running automated requests every 30s with believable increments — far more effort than a single forged submission

## Files changed
- `supabase/functions/submit/index.ts` — add `/heartbeat` endpoint, add checkpoint validation to `/submit`
- `src/pages/Game.tsx` — add heartbeat interval during gameplay
- New migration — create `game_session_checkpoints` table

