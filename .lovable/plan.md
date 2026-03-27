

# Plan: Delete Fake Scores, Secure Docs, Harden Credentials

## Actions

### 1. Delete the 3 fake scores
Remove via the admin edge function endpoint (or data operation):
- `86f3edae-03da-400e-bcd3-67a92e27b190` (PR, 133333)
- `778391f7-ef47-4cdb-898d-0c4e7e258551` (HY, 133335)
- `814a0664-807e-4e5e-a361-681bb1a4530b` (ZOI, 133337)

Also delete their associated `score_audit_log` and `game_session_checkpoints` entries.

### 2. Add `.lovable/` to `.gitignore`
Prevents `plan.md` (which contains anti-cheat implementation details) from being visible in the Git repository.

### 3. Remove credentials from documentation files
- **`SECURITY.md`**: Remove any references to specific project URLs, Supabase refs, or key formats
- **`.env.example`**: Already safe (uses placeholders) — no change needed
- **`scripts/check-highscore-legitimacy.ts`**: References `SUPABASE_SERVICE_ROLE_KEY` by name only (safe) — no change needed

### 4. Important note on the anon key
The Supabase anon key is **public by design** — it ships in the browser JavaScript bundle to every visitor. It cannot be "hidden." Your security comes from:
- ✅ RLS policies blocking direct INSERT/UPDATE/DELETE on score tables
- ✅ Edge function validation (PoW, HMAC, heartbeat consistency)
- ✅ `insert_score_with_audit` function restricted to `SECURITY DEFINER`

The attacker's claim about "exposed credentials" is misleading — the anon key is always visible, but it **cannot** bypass RLS or the edge function. The newly deployed anti-cheat (PoW + HMAC) will block their automated submissions going forward.

## Files Changed

| File | Change |
|------|--------|
| `.gitignore` | Add `.lovable/` entry |
| `SECURITY.md` | Remove specific URLs and implementation thresholds |
| **Data operation** | Delete 3 fake scores + related audit/checkpoint data |

