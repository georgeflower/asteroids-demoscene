# Security

## Highscore Submission Security

### Overview

The highscore submission system has been secured to prevent unauthorized score submissions. Users can no longer submit arbitrary scores through browser console manipulation or direct API calls.

### Security Features

#### 1. Session-Based Validation
- Each game session receives a unique token when starting
- Scores can only be submitted with a valid session token
- Tokens are generated server-side and cannot be forged

#### 2. Rate Limiting
- Maximum 10 score submissions per game session
- Game sessions expire after 1 hour of inactivity
- Prevents spam and abuse of the submission system

#### 3. Duplicate Score Detection
- Detects and rejects duplicate scores (same initials + score)
- Uses a 1-hour sliding window for duplicate detection
- Prevents the same score from being submitted multiple times

#### 4. Score Validation
- Enforces valid score range: 0 to 9,999,999
- Validates initials format: 1-3 uppercase letters (A-Z) only — no content restrictions
- Rejects malformed or suspicious submissions

#### 5. Advanced Behavioral Analysis
- **Score rate analysis**: Validates score progression against physical game limits
- **Play duration checks**: High scores require proportional play time
- **Wave consistency check**: Detects impossible level progression between checkpoints
- **Checkpoint gap detection**: Rejects sessions with irregular heartbeat timing
- **Checkpoint clustering detection**: Flags sessions with suspicious checkpoint distribution
- **Temporal anomaly detection**: Detects automated submission patterns across sessions

#### 6. Submission Audit Trail
- All accepted scores are written with a corresponding `score_audit_log` entry atomically
- Scores without audit entries are automatically deleted
- Suspicious patterns are recorded in `submission_flags` for admin review

#### 7. Secure Database Access
- Direct INSERT permission revoked from public users
- All score insertions go through authenticated Edge Function
- Uses service role key for secure database operations
- Immutable CHECK constraints on `current_high_scores` ensure data integrity at the database level

### Architecture

```
Game Client (Browser)
    ↓
[1] Request Session Token → Edge Function (/start-session)
    ↓
[2] Receive Session Token ← Edge Function
    ↓
[3] Play Game — heartbeats sent every ~30s → Edge Function (/heartbeat)
    ↓
[4] Submit Score + Token → Edge Function (/submit)
    ↓
[5] Validate Session, Score & Checkpoint Data → Database (via service role)
    ↓
[6] Insert score + audit log; flag suspicious patterns
    ↓
[7] Success/Error Response ← Edge Function
```

### Implementation Details

#### Edge Function: `submit`
Handled by the secure edge function with session validation, PoW verification, and HMAC signature checks. Implementation details are kept server-side.

### Admin Monitoring Dashboard

A development-only admin dashboard is available for leaderboard oversight. Access requires a secret admin key configured in the backend environment. Details are available to project maintainers only.

### Database Schema

#### `submission_flags`
Tracks anomalous patterns detected during submission:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `score_id` | uuid | References `current_high_scores` |
| `flag_type` | text | `checkpoint_clustering`, `temporal_cluster`, etc. |
| `severity` | text | `low`, `medium`, or `high` |
| `reasoning` | text | Human-readable explanation |
| `admin_override` | bool | Admin has reviewed and cleared this flag |
| `created_at` | timestamptz | When the flag was recorded |

#### `current_high_scores` CHECK Constraints
Database-level CHECK constraints enforce valid ranges for score, initials format, level, and play time. Details are maintained server-side.

### What This Protects Against

✅ Browser console score manipulation  
✅ Direct Supabase client API calls  
✅ Automated bot submissions  
✅ Duplicate score spam  
✅ Physically impossible scores (too fast, wrong wave count)  
✅ Replay attacks without valid checkpoint history  
✅ Injected scores with no gameplay data  

### What This Does NOT Protect Against

⚠️ Sophisticated memory editing combined with crafted heartbeat replay  
⚠️ Determined attackers who replay valid sessions with modified final score  

### Reporting Security Issues

If you discover a security vulnerability in the highscore system or any other part of the application, please:

1. **Do not** publicly disclose the vulnerability
2. Contact the repository maintainer privately
3. Provide detailed information about the vulnerability
4. Allow time for a fix before public disclosure

### Changelog

#### 2026-03-24: Content Restrictions Removed & Behavioral Analysis Added
- Removed profanity/content filter — any valid A-Z initials now accepted
- Added wave consistency check (rejects impossible level jumps between checkpoints)
- Added high-score minimum play duration (50k+ requires ≥ 300 s)
- Added checkpoint clustering and temporal anomaly flagging
- Created `submission_flags` database table with audit trail
- Added CHECK constraints to `current_high_scores` for immutable data integrity
- Added admin monitoring dashboard (`AdminMonitor.tsx`)
- Added admin Edge Function endpoints (`/admin-data`, `/admin-delete`)
- Increased score/rate limits to accommodate legitimate late-wave high scores

#### 2026-03-13: Submission Tracking Added
- Added `session_token` and `submission_method` columns to database
- Updated Edge Function to store session tokens with submissions
- Created admin utility script for verifying highscore legitimacy
- Marked pre-existing scores as 'legacy'

#### 2026-03-13: Initial Security Implementation
- Implemented Edge Function for secure score submission
- Added session-based validation
- Added rate limiting and duplicate detection
- Updated database policies to restrict direct INSERT
- Updated client to use secure submission flow

---

## Secret Scanning & Credential Management

### Overview

Automated secret scanning prevents credentials from being accidentally committed to the repository.

### CI/CD Scanning Workflows

| Workflow | Trigger | Tools |
|----------|---------|-------|
| `secret-scan.yml` | Every push to main/develop, every PR | Gitleaks, TruffleHog, git-secrets |
| `credentials-audit.yml` | Weekly (Mon 02:00 UTC), manual | TruffleHog deep scan, Gitleaks historical, pattern audit |

### Local Pre-Commit Protection

Install git-secrets to catch issues before they reach GitHub:

```bash
# macOS
brew install git-secrets && git secrets --register-aws --install

# Linux
git clone https://github.com/awslabs/git-secrets /tmp/git-secrets
cd /tmp/git-secrets && sudo make install && cd -
git secrets --register-aws --install
```

See `docs/SECRET_SCANNING.md` for full setup instructions.

### Running the Credential Audit

```bash
# Full history scan
npm run audit:credentials

# Or directly
bash scripts/audit-credentials.sh
```

### Environment Variables

| Variable | Bundle | Sensitivity | Notes |
|----------|--------|-------------|-------|
| `VITE_SUPABASE_URL` | Client | Low | Public project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client | Low | Anon key — designed to be public |
| `VITE_SCORE_HMAC_SECRET` | Client (obfuscated) | Medium | Rotate monthly; also validated server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function only | **Critical** | Never in client code |
| `ADMIN_SECRET_KEY` | Edge Function only | **High** | Admin dashboard authentication |

### Rotating the HMAC Secret

```bash
# Generate a new secret
openssl rand -hex 32

# Update Supabase Edge Function
supabase secrets set VITE_SCORE_HMAC_SECRET=<new-secret>

# Update local .env (never commit)
```

---

## Client Bundle Obfuscation

### Overview

The production build uses terser with aggressive settings to obfuscate the client bundle, making it significantly harder to extract the HMAC secret or reverse-engineer game logic.

### Obfuscation Features

- **Console stripping** — All `console.log`, `console.debug`, and `console.info` calls removed
- **Dead code elimination** — Unreachable code paths removed
- **Aggressive compression** — 3-pass terser compression
- **Name mangling** — Top-level identifiers shortened and renamed
- **No source maps** — Source maps disabled in production
- **Hashed filenames** — Chunk names include content hash for cache-busting and unpredictability

### Verification Scripts

```bash
# Verify obfuscation quality after build
npm run verify:obfuscation

# Attempt to extract HMAC from bundle (should fail)
npm run test:secret-extraction

# Audit bundle size (ensure obfuscation didn't cause bloat)
npm run audit:bundle-size
```

### Limitations

⚠️ The `VITE_SCORE_HMAC_SECRET` is inherently accessible in the client bundle because it must be evaluated at runtime. Terser obfuscation raises the cost of extraction but does not make it impossible for a determined attacker. The primary security guarantee remains the **server-side validation** in the Supabase Edge Function.

