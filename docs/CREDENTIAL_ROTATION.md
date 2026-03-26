# Credential Rotation Procedures

This document describes how to safely rotate secrets used by the Asteroids
leaderboard system without causing downtime.

## Secrets Inventory

| Secret | Location | Purpose | Rotation Frequency |
|--------|----------|---------|-------------------|
| `ADMIN_SECRET_KEY` | Supabase Edge Function env only | Admin dashboard access | Every 90 days |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings | Edge Function DB access | On compromise only |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public (anon key) | Read-only Supabase access | Low priority; rotate on compromise |
| Per-session HMAC nonces | Supabase `game_sessions` table | Signs score submissions per game | Auto-generated; no manual rotation needed |

> **Note on score-signing:** Score submissions are authenticated with per-session
> HMAC nonces generated server-side at session creation and stored in the
> `game_sessions` table. These are never exposed to the client bundle, so
> there is no global shared secret to rotate for score signing.

---

## Rotating `ADMIN_SECRET_KEY`

This key is used only inside the Edge Function (server-side). It is never
exposed to the client bundle. Admin sessions are short-lived (1-hour TTL) and
invalidated immediately on logout.

### Steps

1. **Generate a new key**
   ```bash
   openssl rand -hex 32
   ```

2. **Update the Supabase secret**
   ```bash
   supabase secrets set ADMIN_SECRET_KEY=<new-value>
   ```

3. **Redeploy the Edge Function**
   ```bash
   supabase functions deploy submit
   ```

4. **Invalidate all existing admin sessions** (optional — they expire in 1 hour)
   ```sql
   UPDATE admin_sessions SET invalidated = true WHERE invalidated = false;
   ```

5. **Notify all admins** that they must re-authenticate.

---

## Using the Rotation Helper Script

A helper script is provided to automate rotation of the `ADMIN_SECRET_KEY`:

```bash
chmod +x scripts/rotate-hmac-secret.sh
./scripts/rotate-hmac-secret.sh
```

The script will:
- Generate a new 64-character hex secret
- Set the new secret in Supabase
- Redeploy the Edge Function

---

## Emergency Compromise Response

If you suspect a secret has been compromised:

1. **Immediately rotate the affected secret** (follow steps above)
2. **Invalidate all admin sessions**
   ```sql
   UPDATE admin_sessions SET invalidated = true;
   ```
3. **Review the `security_audit_log` table** for suspicious activity
   ```sql
   SELECT * FROM security_audit_log ORDER BY created_at DESC LIMIT 50;
   ```
4. **Check for injected scores** via the Admin Monitor dashboard
5. **File an incident report** documenting timeline and impact

---

## Key Expiration Policy

| Secret | Max Age | Action on Expiry |
|--------|---------|-----------------|
| `ADMIN_SECRET_KEY` | 90 days | Rotate, notify admins |
| `SUPABASE_SERVICE_ROLE_KEY` | On compromise only | Rotate immediately via Supabase dashboard |
| Admin session tokens | 1 hour | Auto-expired by server |
| Game session nonces | Session lifetime (max 1 hour) | Auto-expired with game session |
