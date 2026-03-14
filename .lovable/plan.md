

# Fix: Deferred Trigger Deleting All New Scores

## Root Cause

The `verify_score_audit` trigger fires at the end of the transaction that inserts the score into `current_high_scores`. However, the audit log is inserted in a **separate** Supabase client call — which is a separate transaction. So at commit time, no audit log exists, and the trigger deletes the score.

This means **every score submitted since the trigger was created has been silently deleted**.

## Solution

Replace the two separate inserts (score + audit) with a **single database function** that inserts both in the same transaction. The deferred trigger will then find the audit log at commit time.

### 1. Create a database function `insert_score_with_audit`

```sql
CREATE OR REPLACE FUNCTION public.insert_score_with_audit(
  p_initials TEXT,
  p_score INTEGER,
  p_level INTEGER,
  p_time_played_seconds INTEGER,
  p_source TEXT,
  p_session_token TEXT
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score_id uuid;
BEGIN
  INSERT INTO current_high_scores (initials, score, level, time_played_seconds, source)
  VALUES (p_initials, p_score, p_level, p_time_played_seconds, p_source)
  RETURNING id INTO v_score_id;

  INSERT INTO score_audit_log (score_id, session_token, submission_method)
  VALUES (v_score_id, p_session_token, 'edge_function');

  RETURN v_score_id;
END;
$$;
```

### 2. Update Edge Function (`supabase/functions/submit/index.ts`)

Replace the two separate `.insert()` calls with a single `.rpc('insert_score_with_audit', {...})` call. This ensures both inserts happen in one transaction.

### 3. Manually re-insert the user's lost score (50890)

Insert the score that was lost today with a matching audit log entry using the new function.

| File/Location | Change |
|---|---|
| Database migration | Create `insert_score_with_audit` function |
| `supabase/functions/submit/index.ts` | Replace two inserts with single RPC call |
| Database | Re-insert lost MBD score (50890, level 6) |

