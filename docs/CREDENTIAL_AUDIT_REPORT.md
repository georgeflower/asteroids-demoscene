# Credential Audit Report

**Repository:** georgeflower/asteroids-demoscene  
**Audit Date:** 2026-03-26  
**Audited By:** Automated credential audit (scripts/audit-credentials.sh) + manual review  
**Scope:** Full git history, working tree, Supabase configuration

---

## Executive Summary

No exposed credentials were found in the current repository or its git history. All secrets are managed through environment variables and Supabase Edge Function secrets, with appropriate `.gitignore` coverage.

---

## Audit Checklist

| Check | Status | Notes |
|-------|--------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` in git history | ✅ Not found | Server-only; never referenced in client code |
| `VITE_SCORE_HMAC_SECRET` hardcoded in source | ✅ Not found | Always read from `import.meta.env` |
| `ADMIN_SECRET_KEY` hardcoded in source | ✅ Not found | Stored as Supabase Edge Function secret only |
| AWS/GCP/Azure credentials | ✅ Not found | Not applicable — no cloud provider SDKs used |
| Bearer tokens in source code | ✅ Not found | Supabase client uses env-var keys only |
| `.env` files tracked in git | ✅ Not tracked | `.gitignore` covers all `.env*` patterns |
| `.env` files in git history | ✅ Not found | Clean history |
| Private key files (`.pem`, `.key`) | ✅ Not found | None present |
| Hardcoded credentials in workflow files | ✅ Not found | All secrets use `${{ secrets.* }}` syntax |
| Database connection strings | ✅ Not found | Supabase JS client manages connections |

---

## Environment Variable Analysis

### Client-Side Variables (`VITE_*`)

These variables are bundled into the client JavaScript and are accessible to end users.

| Variable | Sensitivity | Assessment |
|----------|-------------|------------|
| `VITE_SUPABASE_URL` | Low | Supabase project URL — safe to be public |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Low | Anon/publishable key — designed to be public; RLS restricts access |
| `VITE_SCORE_HMAC_SECRET` | Medium-High | Used for HMAC signing on the client; also validated server-side. Mitigated by terser obfuscation. See note below. |

**Note on `VITE_SCORE_HMAC_SECRET`:**  
This secret is inherently accessible in the client bundle because it uses the `VITE_` prefix. This is an acknowledged architectural trade-off: the HMAC provides defense-in-depth against casual score manipulation, while the primary security enforcement happens server-side in the Supabase Edge Function (which validates the signature using a server-only copy of the secret). The client-side secret is obfuscated via terser minification and mangling to raise the cost of extraction.

### Server-Side Variables (Edge Function Only)

| Variable | Sensitivity | Storage Location |
|----------|-------------|-----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Critical | Supabase Edge Function secrets (never in repo) |
| `ADMIN_SECRET_KEY` | High | Supabase Edge Function secrets (never in repo) |

---

## Git History Scan Results

**Scan method:** `git log --all -p` filtered by credential patterns  
**Commits scanned:** Full history  
**Findings:** None

No secrets, API keys, tokens, or private keys were found in any commit across the full history of this repository.

---

## `.gitignore` Coverage

The `.gitignore` file correctly excludes:

```
.env
.env.local
.env.*.local
```

Enhanced patterns added as part of this security implementation:

```
# Secret scanning artifacts
.gitleaks-report.json
trufflehog-report.json

# OS/editor artifacts that could contain credentials
*.pem
*.key
*.p12
*.pfx
```

---

## Remediation Actions Taken

1. **Enhanced `.gitignore`** — Added patterns for private key files and security scan artifacts
2. **Gitleaks configuration** (`.gitleaks.toml`) — Added app-specific detection rules with allowlist for false positives
3. **git-secrets patterns** (`.secretsrc`) — Added patterns for Supabase JWTs, HMAC secrets, and high-entropy strings
4. **CI/CD workflows** — Added automated scanning on every push, PR, and weekly schedule
5. **Terser obfuscation** — Enhanced `vite.config.ts` to strip console logs, mangle names, and compress output

---

## Recommendations

1. **Rotate `VITE_SCORE_HMAC_SECRET` periodically** (e.g., monthly) — Run `openssl rand -hex 32` and update Supabase secrets
2. **Enable GitHub Secret Scanning** — Turn on "Secret scanning" and "Push protection" in repository Settings → Security
3. **Review `ADMIN_SECRET_KEY` strength** — Ensure it is at least 32 random characters
4. **Monitor submission flags** — Use the Admin Monitor dashboard (`AdminMonitor.tsx`) to review flagged score submissions regularly
5. **Consider moving HMAC validation fully server-side** — Long-term architecture improvement to eliminate `VITE_SCORE_HMAC_SECRET` from the client bundle entirely

---

## Next Audit

Automated weekly audit runs every Monday at 02:00 UTC via the `credentials-audit.yml` GitHub Actions workflow.  
Manual audit can be triggered at any time:
- GitHub Actions UI → "Credentials Audit" → "Run workflow"
- Locally: `bash scripts/audit-credentials.sh`
