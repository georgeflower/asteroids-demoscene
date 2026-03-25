

# Fix: RPC Function Callable by Anyone (The Actual Exploit)

## What ZOI Did

The attacker used the **public anon key** (which is intentionally public in every Supabase+Vite app — it ships in the browser bundle) to call the `insert_score_with_audit` database function directly:

```javascript
supabase.rpc('insert_score_with_audit', {
  p_initials: 'ZOI',
  p_score: 999999,
  p_level: 1,
  p_time_played_seconds: 10,
  p_source: 'fake',
  p_session_token: 'anything'
})
```

This bypasses the edge function entirely — no session validation, no heartbeat checks, no rate limiting. The function is `SECURITY DEFINER`, so it runs with full owner privileges regardless of who calls it.

**The anon key is not the problem.** It is always public. The problem is that the RPC function has `EXECUTE` granted to `PUBLIC`.

## Fix

One database migration to revoke public access:

```sql
REVOKE EXECUTE ON FUNCTION public.insert_score_with_audit FROM PUBLIC, anon, authenticated;
```

After this, only the **service role** (used by the edge function) can call the function. Anyone trying `supabase.rpc('insert_score_with_audit', ...)` with the anon key will get a permission error.

Also revoke the cleanup function for good measure:

```sql
REVOKE EXECUTE ON FUNCTION public.cleanup_old_sessions FROM PUBLIC, anon, authenticated;
```

### Files changed
- New migration — two `REVOKE EXECUTE` statements

## Technical Details

| Before | After |
|--------|-------|
| `insert_score_with_audit` callable by anyone via `supabase.rpc()` | Only service role (edge function) can call it |
| Attacker bypasses all validation | RPC calls from browser return permission denied |
| Heartbeats, session checks irrelevant | All submissions must go through edge function |

No code changes needed. The edge function already uses the service role key, so it will continue working.

