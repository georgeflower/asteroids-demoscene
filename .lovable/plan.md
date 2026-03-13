

# Harden Score Submission Anti-Cheat

## Root Cause

The edge function's plausibility validation is trivially bypassed. An attacker can:
1. Call `/start-session` to get a valid token
2. Call `/submit` directly with inflated `level` and `timePlayedSeconds` values to pass all checks

The server blindly trusts client-reported level and time values.

## Solution

### 1. Server-side session tracking (Edge Function)

Track game start time **server-side** in the session object. When a score is submitted, use the server's own elapsed time instead of trusting `timePlayedSeconds` from the client.

```typescript
// In GameSession interface, startTime already exists
// On submit: calculate time server-side
const serverTimePlayedSeconds = Math.floor((Date.now() - session.startTime) / 1000);
// Use serverTimePlayedSeconds for plausibility, ignore client value
```

### 2. Tighten plausibility validation

- Make `level` and `timePlayedSeconds` validation **mandatory** (not optional)
- Use server-calculated time, not client-reported time
- Lower the max score-per-second ratio (currently 1000/sec is extremely generous)
- Cap max score per level more tightly

### 3. Auto-cleanup trigger (database)

Add a database trigger: when a row is inserted into `current_high_scores`, a scheduled check (or trigger after a short delay) verifies that a corresponding `score_audit_log` entry exists. If not, delete the score. This catches any future bypass of the edge function.

```sql
-- Trigger function: after insert on current_high_scores,
-- if no audit log exists within 10 seconds, delete the row
CREATE OR REPLACE FUNCTION cleanup_unaudited_scores()
RETURNS TRIGGER AS $$
BEGIN
  -- Check audit log exists for this score
  IF NOT EXISTS (
    SELECT 1 FROM score_audit_log WHERE score_id = NEW.id
  ) THEN
    DELETE FROM current_high_scores WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

However, since the edge function inserts the score first then the audit log, a trigger on INSERT would fire too early. Instead: a **periodic cleanup query** or a **constraint trigger** (deferred) that runs at transaction end.

Better approach: **wrap the score insert + audit insert in the edge function within a single transaction-like flow**, and use a deferred constraint trigger.

### 4. Delete the existing fraudulent score

Remove the BUT:3133700 entry from the database.

## Changes

| File/Location | Change |
|---|---|
| `supabase/functions/submit/index.ts` | Use server-side time tracking; make level/time mandatory; tighten ratio |
| Database migration | Add deferred trigger to verify audit log exists |
| Database | Delete fraudulent BUT score |

## Technical Detail

The key fix is **server-side time tracking**. Since `startTime` is already stored in the session object when `/start-session` is called, we simply calculate elapsed time on the server and ignore the client's `timePlayedSeconds`. This makes the time-based plausibility check unforgeable (unless the attacker waits the actual game duration).

