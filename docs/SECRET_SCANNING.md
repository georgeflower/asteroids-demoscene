# Secret Scanning Developer Guide

## Overview

This project uses automated secret scanning to prevent credentials from being committed to the Git repository. Three complementary tools are configured:

| Tool | Purpose | Trigger |
|------|---------|---------|
| **Gitleaks** | Pattern & entropy-based scan | Every push / PR |
| **TruffleHog** | Entropy + verified credential scan | Every push / PR |
| **git-secrets** | Pattern-based pre-commit scan | Full history weekly |

---

## Setting Up Local Pre-Commit Hooks

To catch secrets before they reach GitHub, install the pre-commit hook locally:

```bash
# Install git-secrets (macOS)
brew install git-secrets

# Install git-secrets (Linux / manual)
git clone https://github.com/awslabs/git-secrets.git /tmp/git-secrets
cd /tmp/git-secrets && sudo make install
cd -

# Register AWS patterns (catches generic credential patterns too)
git secrets --register-aws

# Add app-specific patterns from .secretsrc
while IFS= read -r pattern || [ -n "$pattern" ]; do
  [[ "$pattern" =~ ^#.*$ || -z "$pattern" ]] && continue
  git secrets --add "$pattern"
done < .secretsrc

# Install the pre-commit hook
git secrets --install
```

After setup, `git commit` will automatically reject commits containing secrets.

### Manual Scan

```bash
# Scan working tree
git secrets --scan

# Scan full git history
git secrets --scan-history
```

---

## GitHub Actions Workflows

### `secret-scan.yml` — On Push / PR

Runs automatically on every push to `main` or `develop`, and on all pull requests.

**Jobs:**

1. **gitleaks** — Entropy + pattern scan via [Gitleaks](https://github.com/gitleaks/gitleaks)
2. **trufflehog** — Verified credential detection via [TruffleHog OSS](https://github.com/trufflesecurity/trufflehog)
3. **pattern-scan** — git-secrets pattern matching across full history

### `credentials-audit.yml` — Weekly / Manual

Runs every Monday at 02:00 UTC. Can also be triggered manually from the GitHub Actions UI.

**Jobs:**

1. **historical-audit** — Deep TruffleHog + Gitleaks scan of up to 100 commits
2. **env-file-audit** — Verifies `.env` files are not tracked in git history
3. **supabase-audit** — Scans for Supabase service role keys and HMAC secrets

---

## Configuration Files

### `.gitleaks.toml`

Extends the Gitleaks default ruleset with app-specific rules:

- `supabase-service-role-key` — Detects Supabase service role JWTs
- `vite-hmac-secret` — Detects hardcoded VITE_SCORE_HMAC_SECRET values
- `admin-secret-key` — Detects hardcoded admin keys

Allowlisted paths include `.env.example`, `SECURITY.md`, and documentation files that intentionally reference placeholder values.

### `.secretsrc`

Pattern list loaded by git-secrets. Contains:
- Supabase JWT patterns
- HMAC secret assignment patterns
- Generic high-entropy hex patterns
- Private key header patterns

### `.credentialAllowlist`

Regex patterns for known-safe values that scanners may flag as false positives. Update this file when adding new placeholder examples to documentation.

---

## Running the Credential Audit Manually

```bash
# Full history scan (default)
bash scripts/audit-credentials.sh

# Scan only the last 20 commits
bash scripts/audit-credentials.sh --recent 20
```

The script checks:

1. `.gitignore` covers all secret file patterns
2. No `.env` files are tracked by git
3. No `SUPABASE_SERVICE_ROLE_KEY` in git history
4. No hardcoded `VITE_SCORE_HMAC_SECRET` values
5. No Bearer tokens or API keys in source
6. No private key files in working tree
7. No suspicious 64-char hex strings in source
8. No hardcoded credentials in GitHub Actions workflow files

---

## What to Do When a Secret Is Detected

### If a secret is detected in a PR or push:

1. **Do not merge** the PR until the secret is resolved
2. Revoke/rotate the exposed credential immediately (regardless of whether the PR is merged)
3. Remove the secret from the commit using `git rebase -i` or `git filter-repo`
4. Force-push the cleaned branch (coordinate with the team)
5. Add the secret pattern to `.credentialAllowlist` if it was a false positive

### If a secret is found in historical commits:

1. Rotate the credential immediately — assume it is compromised
2. Use `git filter-repo` to remove the secret from history
3. Force-push all affected branches
4. Notify the repository maintainer and invalidate any tokens

### Rotating the HMAC Secret

```bash
# Generate a new 64-character hex secret
openssl rand -hex 32

# Set it in Supabase Edge Function environment
supabase secrets set VITE_SCORE_HMAC_SECRET=<new-secret>

# Update your local .env (never commit this file)
# VITE_SCORE_HMAC_SECRET=<new-secret>
```

---

## False Positives

If a scanner flags a value that is intentionally non-sensitive (e.g., a placeholder in documentation), add a regex to `.credentialAllowlist` and to the `allowlist.regexes` array in `.gitleaks.toml`.

---

## Environment Variables Reference

| Variable | Location | Sensitivity | Notes |
|----------|----------|-------------|-------|
| `VITE_SUPABASE_URL` | Client bundle | Low | Public Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client bundle | Low | Anon key — safe to expose |
| `VITE_SCORE_HMAC_SECRET` | Client bundle | **HIGH** | Obfuscated in build; rotate if exposed |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function only | **CRITICAL** | Never in client code |
| `ADMIN_SECRET_KEY` | Edge Function only | **HIGH** | Admin dashboard authentication |
