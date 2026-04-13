

# Fix: High Score Submission Failure + Clear Bullets on New Wave

## Problem 1: "Failed to save high score"
The edge function logs show: `High-score mismatch: submitted=81360, lastHB=72020`. 

The submit endpoint (line 633) has a hard rule: for scores above 50,000, the submitted score must be within 5,000 of the last heartbeat score. But heartbeats are sent every 30 seconds, and a player can easily earn 9,000+ points in that window. The time-based check on line 625 already correctly validates this (allowing `dtSinceLastHeartbeat * 1000` pts/sec), making the hard 5,000 cap redundant and too restrictive.

**Fix**: Increase the tolerance from 5,000 to a time-aware value. Replace the hard cap with: allow `lastScore + max(10000, dtSinceLastHeartbeat * MAX_SCORE_JUMP_PER_SECOND)`. This keeps anti-cheat protection while accommodating legitimate play between heartbeats.

**File**: `supabase/functions/submit/index.ts` (lines 632-636)

## Problem 2: Bullets persist into new wave
When a wave ends and `nextWave()` is called, asteroids and aliens are cleared but `state.bullets` is not. This means leftover player/enemy bullets from the previous wave can hit newly spawned asteroids.

**Fix**: Add `state.bullets = [];` at the start of the `nextWave` function, for both boss and regular waves.

**File**: `src/pages/Game.tsx` — in the `nextWave` callback (~line 1876, after `state.wave++`)

## Technical Details

### Edge function change (submit/index.ts)
```typescript
// Replace lines 632-636:
// Old: hard 5000pt cap
// New: time-aware tolerance
const timeTolerance = Math.max(10000, dtSinceLastHeartbeat * MAX_SCORE_JUMP_PER_SECOND);
if (submission.score > 50000 && submission.score > lastScore + timeTolerance) {
  console.log(`High-score mismatch: submitted=${submission.score}, lastHB=${lastScore}, tolerance=${timeTolerance.toFixed(0)}, token=${submission.gameSessionToken}`);
  return errorResponse('Final score anomaly', 403);
}
```

### Game.tsx change (nextWave)
```typescript
// After state.wave++ (line 1876), add:
state.bullets = [];
```

### Deployment
- Redeploy the `submit` edge function after editing

