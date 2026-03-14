

# Insert MBD Score + Fix Cold-Start Session Bug

## Why MBD Got "Failed to Upload Score"

The root cause is the **cold-start session loss**. Edge functions use in-memory storage for game sessions. When the function shuts down and reboots (which happens frequently — logs show boot/shutdown cycles), all sessions are lost.

The auto-recreate logic (line 65-74) sets `startTime: Date.now()`, which means `serverTimePlayedSeconds ≈ 0`. This fails the `MIN_PLAY_TIME_SECONDS = 10` check, returning `"Game duration too short"` — which the client displays as "failed to upload score".

## Changes

### 1. Insert MBD score + audit log (database migration)

Insert the score with proper audit trail so the deferred trigger doesn't delete it:

```sql
-- Insert score
INSERT INTO current_high_scores (initials, score, level, time_played_seconds, source, created_at)
VALUES ('MBD', 116040, 7, 600, 'manual_admin', '2026-03-14T12:26:00+00:00');

-- Insert matching audit log
INSERT INTO score_audit_log (score_id, session_token, submission_method)
SELECT id, 'manual-admin-insert', 'manual'
FROM current_high_scores
WHERE initials = 'MBD' AND score = 116040 AND created_at = '2026-03-14T12:26:00+00:00';
```

### 2. Fix cold-start session handling (`supabase/functions/submit/index.ts`)

When a session is auto-recreated after a cold start, the server has no way to know the real start time. Two options:

**Option A (Recommended):** Accept client-reported `timePlayedSeconds` as a fallback when the session was auto-recreated, but cap it at the maximum session timeout. Add a flag to the session: `recreated: true`. When recreated, use `Math.max(clientTime, serverTime)` but cap at a reasonable maximum.

**Option B:** Store sessions in the database instead of in-memory. This would survive cold starts but adds latency.

Going with **Option A** — pragmatic fix:

```typescript
// In ScoreSubmission interface, keep timePlayedSeconds
// In session auto-recreate, add a flag
session = {
  token,
  startTime: Date.now(),
  lastScore: 0,
  submissionCount: 0,
  lastSubmissionTime: 0,
  recreated: true,  // Flag that this was auto-recreated
};

// In submit handler, when calculating time:
const serverTimePlayedSeconds = Math.floor((Date.now() - session.startTime) / 1000);
let effectiveTimePlayed = serverTimePlayedSeconds;

if (session.recreated && submission.timePlayedSeconds) {
  // Use client time as fallback, but cap it reasonably
  effectiveTimePlayed = Math.min(
    submission.timePlayedSeconds,
    Math.floor(SESSION_TIMEOUT / 1000) // Cap at max session duration
  );
}
```

This means a recreated session still validates plausibility but uses client-reported time (capped). An attacker would still need a valid UUID token and the time cap limits abuse.

### Files to edit
- **Database migration**: Insert MBD score + audit log
- **`supabase/functions/submit/index.ts`**: Add `recreated` flag to session, use client time as fallback when recreated

