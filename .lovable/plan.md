

# Plan: RLS Lockdown, CAS Heartbeat Updates, HMAC with seq

Three targeted fixes from the security review, plus bonus hardening items.

## What's Being Fixed

1. **Internal tables lack RLS** — `game_sessions`, `game_session_checkpoints`, and `score_audit_log` have RLS disabled, meaning they're accessible via PostgREST if grants exist.
2. **Heartbeat update is not atomic** — two parallel heartbeats can both read the same `last_seq` and both pass validation before either writes.
3. **HMAC doesn't include `seq`** — an attacker could replay a signed payload with a different seq value.
4. **Bonus**: timing-safe HMAC compare, require `seq` strictly, accept both `k`/`gameSessionToken` field names.

## Changes

### 1. Database Migration — RLS + deny-all on internal tables

Enable RLS and add deny-all policies on `game_sessions`, `game_session_checkpoints`, and `score_audit_log`. The `submission_flags` table already has RLS enabled with a service-role-only policy.

Service role bypasses RLS, so Edge Functions continue working. Also revoke direct grants from `anon` and `authenticated`.

```sql
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_audit_log ENABLE ROW LEVEL SECURITY;

-- Deny-all policies for each table (SELECT, INSERT, UPDATE, DELETE)
-- ...

REVOKE ALL ON public.game_sessions FROM anon, authenticated;
REVOKE ALL ON public.game_session_checkpoints FROM anon, authenticated;
REVOKE ALL ON public.score_audit_log FROM anon, authenticated;
```

### 2. Edge Function — CAS on heartbeat update

Change the session update in `handleHeartbeat` from:
```
UPDATE ... WHERE token = ?
```
to:
```
UPDATE ... WHERE token = ? AND last_seq = ?
```

Then check that exactly 1 row was updated. If 0 rows, return 409 (concurrent heartbeat won the race).

This applies to both the "first heartbeat" path (guard with `last_seq = 0`) and the "subsequent heartbeat" path.

### 3. Edge Function — Include seq in HMAC + backward compat

**Server**: create a `verifyHMACCompat` function that tries the new format first (`token|score|level|asteroids|bullets|seq`), then falls back to old format (`token|score|level|asteroids|bullets`) for clients that haven't updated yet.

**Client** (`Game.tsx` line 628): update the HMAC message to include seq:
```typescript
`${token}|${score}|${level}|${asteroidsDestroyed}|${bulletsFired}|${seq}`
```

Note: seq must be computed before the HMAC call (move the increment above the HMAC computation).

### 4. Edge Function — Timing-safe HMAC compare

Replace `computed === expectedHmac` in `verifyHMAC` with a constant-time comparison to prevent timing side-channel attacks.

### 5. Edge Function — Require seq strictly

Change seq validation from "if seq is provided" to always required. Reject heartbeats with `seq === undefined` or `seq === null`.

### 6. Edge Function — Robust field-name parsing

Accept both minified and full field names in heartbeat payloads:
```typescript
const token = payload.gameSessionToken ?? payload.k;
const ast = payload.asteroidsDestroyed ?? payload.l ?? 0;
const bul = payload.bulletsFired ?? payload.u ?? 0;
```

This prevents silent breakage if the production client sends minified keys due to Terser property mangling.

## Files Changed

| File | Change |
|------|--------|
| **Migration SQL** | Enable RLS + deny-all policies on 3 internal tables + revoke grants |
| `supabase/functions/submit/index.ts` | CAS update, HMAC with seq + backward compat, timing-safe compare, require seq, robust field parsing |
| `src/pages/Game.tsx` | Include seq in HMAC message (move seq increment before HMAC computation) |

## No breaking changes

- Server accepts both old and new HMAC formats during transition
- Field-name fallbacks ensure both minified and full payloads work
- RLS deny-all doesn't affect Edge Functions (service role bypasses RLS)

