# Security

## Highscore Submission Security

### Overview

The highscore submission system uses multiple independent security layers to prevent score manipulation. Users cannot submit arbitrary scores through browser console tricks, direct API calls, or replay attacks. Every accepted score must pass each layer described below before it is written to the database.

### Architecture

```
Game Client (Browser)
    │
    ├─[1]─► POST /start-session  →  Edge Function
    │         • Receives: session token, session nonce, PoW challenge + difficulty
    │         • Client solves PoW challenge in the background
    │
    ├─[2]─► Play Game
    │         • Heartbeat POSTs to /heartbeat every ~30 s
    │           carrying: token, score, level, asteroidsDestroyed, bulletsFired,
    │                     monotonically-increasing seq, HMAC signature
    │
    ├─[3]─► POST /submit  →  Edge Function
    │         • Carries: same fields + final score, initials, PoW nonce, HMAC
    │
    └─[4]─► Edge Function validates ALL layers (see below)
              → insert_score_with_audit() RPC (atomic)
              → submission_flags inserted for any suspicious patterns
              → Success / error response returned
```

---

### Layer 1 — Origin Validation

All three Edge Function endpoints (`/start-session`, `/heartbeat`, `/submit`) check the HTTP `Origin` and `Referer` headers against a hard-coded allowlist of the game's known domains. Requests from any other origin receive `403 Forbidden` before any other processing.

---

### Layer 2 — Game Session Token

- When a new game starts the client POSTs to `/start-session`.
- The Edge Function generates a cryptographically random UUID (`crypto.randomUUID()`), stores it in `game_sessions`, and returns it.
- Every subsequent request must carry this token. There is no way to forge a valid token.
- Sessions expire after **1 hour** of total age and are marked `expired = true` after the first score submission, making each token single-use.
- A session accepts exactly one submission; the slot is claimed atomically (`submission_count` 0 → 1), so later retries of the same session receive `MAX_SUBMISSIONS`. The client treats that as success when the leaderboard already contains the same initials and score.

---

### Layer 3 — HMAC Signing (session nonce)

#### How it works
At session start the Edge Function generates a second random UUID called the **session nonce** and stores it in `game_sessions.session_nonce`. This nonce is returned to the client and is the shared HMAC secret.

Every heartbeat and the final score submission must include an **HMAC-SHA-256** hex digest computed over:

```
{sessionToken}|{score}|{level}|{asteroidsDestroyed}|{bulletsFired}|{seq}
```

using the session nonce as the key (V2 format). The server independently re-computes this digest using the stored nonce and compares them with a **timing-safe byte-by-byte comparison** (`timingSafeEqual`) to prevent timing-oracle attacks.

A V1 fallback (without `seq`) is accepted for backward compatibility with older clients, but V2 is preferred.

#### What this prevents
Because the session nonce is only ever stored server-side and transmitted only to the originating client over HTTPS, an attacker cannot compute a valid HMAC without also being able to intercept the game's HTTPS session. Forging or modifying any signed field in transit (score, level, counts, or seq) causes HMAC verification to fail.

---

### Layer 4 — Proof-of-Work (PoW)

At session start the Edge Function generates a random **PoW challenge** (two concatenated UUIDs) and a **difficulty** of 18 bits. The client must find a `nonce` such that `SHA-256(challenge + nonce)` has at least 18 leading zero bits.

The client solves this asynchronously in the background while the player is in-game. The solved nonce must be included in the final `/submit` call. The Edge Function re-runs the same SHA-256 check server-side and rejects any submission where the nonce is missing or produces fewer than the required leading zero bits.

This imposes a non-trivial CPU cost on each submission attempt, making automated bulk submissions expensive without blocking legitimate players.

---

### Layer 5 — Monotonic Sequence Numbers (anti-replay)

Each heartbeat and the final submission include a strictly increasing `seq` integer that starts at 0 when the session is created. The Edge Function stores `last_seq` in `game_sessions` and rejects any message whose `seq` is not strictly greater than `last_seq`. This prevents replay of any previously valid signed message.

---

### Layer 6 — Server-Authoritative State & Compare-And-Swap Updates

The `game_sessions` table stores a server-side copy of the current game state:

| Field | Meaning |
|---|---|
| `last_seq` | Most recently accepted sequence number |
| `last_score` | Score at the most recent heartbeat |
| `last_level` | Wave/level at the most recent heartbeat |
| `last_asteroids` | `asteroidsDestroyed` at the most recent heartbeat |
| `last_bullets` | `bulletsFired` at the most recent heartbeat |

Heartbeat updates use a **Compare-And-Swap (CAS)** guard:

```sql
UPDATE game_sessions
SET    last_seq = $new_seq, last_score = $new_score, ...
WHERE  token = $token
AND    last_seq = $expected_seq   -- CAS guard
```

If another heartbeat has already advanced `last_seq` between the read and the write, the update matches zero rows and the request is rejected with `409 Out-of-order heartbeat`. This makes concurrent replay attacks self-defeating.

---

### Layer 7 — Heartbeat Delta Validation

Every heartbeat is checked against the server-authoritative state from the previous heartbeat over the real elapsed time (`dtSec`). Hard limits reject; soft limits add a session flag and accept.

| Metric | Hard reject | Soft flag |
|---|---|---|
| Score | Decrease; delta > 10 000 × dtSec + 100 000 | delta > 2 500 × dtSec + 100 000 (`heartbeat_score_rate`) |
| `asteroidsDestroyed` | Decrease; delta > 12 × dtSec + 20 | — |
| `bulletsFired` | Decrease; delta > 14 × dtSec + 20 | — |
| Level (wave) | Decrease; jump > 5 per interval | — |

---

### Layer 8 — Heartbeat Rate Limiting

- **Absolute minimum gap**: 5 000 ms between any two heartbeats.
- **Per-minute cap**: at most 6 heartbeats per 60-second sliding window.
- Requests that exceed these limits receive `429 Too frequent` / `429 Rate limit exceeded`.

---

### Layer 9 — Burst / Timing Pattern Detection

After 5 or more checkpoints, inter-checkpoint timing with standard deviation < 500 ms and mean < 15 000 ms adds a `regular_timing` (low) session flag. It no longer rejects or expires the session.

---

### Layer 10 — Proof of At Least One Heartbeat

The `/submit` endpoint requires `game_sessions.last_heartbeat_at` to be non-null. A score submitted with no heartbeat history at all (e.g. a freshly created token sent directly to `/submit`) is rejected with `403 Insufficient gameplay data`.

---

### Layer 11 — Score Plausibility (time and level)

`serverTimePlayedSeconds` is measured from `started_at` to the submission.

| Check | Type |
|---|---|
| `serverTimePlayedSeconds < 10` | Hard reject |
| `score > serverTimePlayedSeconds × 10 000 + 100 000` | Hard reject |
| `level` outside 1–100 | Hard reject |
| `score > level × 400 000` | Hard reject |
| `score > serverTimePlayedSeconds × 2 500 + 100 000` | Flag `high_score_rate` |
| `score > level × 150 000` | Flag `score_vs_wave` |
| `score ≥ 50 000` and `serverTimePlayedSeconds < 120` | Flag `short_high_score` |
| `level == 1` and `score > 40 000` | Flag `level1_high_score` |

---

### Layer 12 — Final Score Cross-Check Against Server State

| Check | Type |
|---|---|
| `score > last_score + dtSinceLastHeartbeat × 10 000 + 100 000` | Hard reject |
| `score > last_score + max(60 000, dtSinceLastHeartbeat × 2 500)` | Flag `final_score_jump` |

---

### Layer 13 — Checkpoint Requirements

At least one heartbeat checkpoint is required (hard reject otherwise). The former score-scaled minimum checkpoint table is removed. Sessions of 180 s or more with fewer than `floor(serverTimePlayedSeconds / 90)` checkpoints get a `sparse_checkpoints` flag.

---

### Layer 14 — Checkpoint Progression Analysis

| Check | Type |
|---|---|
| Gap > 90 s between consecutive checkpoints | Flag `checkpoint_gap` |
| Level decreases or jumps > 5 | Hard reject |
| Score delta > gap × 10 000 + 100 000 | Hard reject |
| Score delta > gap × 2 500 + 100 000 | Flag `checkpoint_score_rate` |
| `asteroidsDestroyed` / `bulletsFired` decrease | Hard reject |

---

### Layer 15 — Suspicious Pattern Flagging

The following patterns are **not** outright rejections but are recorded as entries in `submission_flags` (with `severity` of `low`, `medium`, or `high`) for admin review:

| Flag type | Trigger |
|---|---|
| `duplicate_score_sequence` | Score unchanged for ≥ 3 consecutive heartbeats |
| `stagnant_asteroids` | `asteroidsDestroyed` stuck for ≥ 2 heartbeats while score increases |
| `stagnant_bullets` | `bulletsFired` stuck for ≥ 2 heartbeats while score increases |
| `score_metric_mismatch` | Average pts/asteroid > 2 000 |
| `checkpoint_clustering` | All checkpoints span < 15% of session age and start within first 10% |
| `temporal_cluster` | Same initials + score appears in the last 5 minutes |

---

### Layer 16 — Entropy / Variance Analysis

For sessions with 5 or more checkpoints:

| Check | Type |
|---|---|
| Score delta coefficient of variation < 0.15 | Flag `uniform_score_deltas` |
| Points-per-asteroid standard deviation < 5 (≥ 4 intervals) | Flag `uniform_points_per_asteroid` |

Cross-session fingerprint matches (Layer 17) remain a hard reject, applied only with ≥ 4 checkpoints and at least one non-zero score.

---

### Layer 17 — Cross-Session Fingerprinting

Before accepting a score the Edge Function computes a **checkpoint fingerprint** — the comma-joined sequence of checkpoint scores for the session. This is compared against checkpoints from all other sessions in the past 30 minutes. If an exact fingerprint match is found the submission is rejected with `403 Duplicate gameplay pattern detected`.

---

### Layer 18 — Duplicate Score Detection

A 1-hour sliding window check prevents the exact same `(initials, score)` combination from being inserted twice. Duplicates receive `409 Duplicate score detected`.

---

### Layer 19 — Atomic Score Insert with Audit Log

Accepted scores are written via the `insert_score_with_audit` PostgreSQL RPC which inserts both the score row and a `score_audit_log` row in a single transaction. A database trigger automatically deletes any score row that does not have a corresponding audit entry, closing a potential race window.

---

### Layer 20 — Database Access Control

- Row Level Security (RLS) on `current_high_scores` restricts `INSERT` to the `service_role` only. Anonymous and authenticated Supabase client roles cannot write scores directly.
- The Edge Function authenticates with the Supabase **service role key**, which is stored as an environment secret and never exposed to the browser.
- `CHECK` constraints on `current_high_scores` enforce valid ranges for score, initials format, level, and play time at the database level, providing a final defence-in-depth backstop.

---

### Layer 21 — Admin Endpoint Authentication

The `/admin-data` (GET), `/admin-delete` (POST), and `/admin-approve` (POST) endpoints require a secret `x-admin-key` request header that must exactly match the `ADMIN_SECRET_KEY` environment variable stored in the Edge Function secrets. Any request with a missing or incorrect key receives `401 Unauthorized`.

`/admin-approve` inserts a rejected run into the leaderboard with source `admin_approved` through `insert_score_with_audit`; already-approved rows are refused.

The in-browser Admin Monitoring Dashboard (`AdminMonitor.tsx`) is activated by setting `localStorage.asteroids_admin = 'true'` and also requires the correct admin key at runtime.

---

### Layer 22 — Rejected-Submission Log & Admin Review

Every hard rejection is stored in `rejected_submissions` with `session_token`, `initials`, `score`, `level`, `code`, `message`, `detail` jsonb, `origin`, `user_agent`, `approved`, and `created_at`. The admin dashboard lists the latest 100 rejected submissions and can approve a legitimate run.

---

### HMAC Format Reference

| Version | Message format | Notes |
|---|---|---|
| V2 (current) | `{token}\|{score}\|{level}\|{asteroidsDestroyed}\|{bulletsFired}\|{seq}` | Includes sequence number; preferred |
| V1 (legacy) | `{token}\|{score}\|{level}\|{asteroidsDestroyed}\|{bulletsFired}` | Accepted for backward compatibility |

Key: `game_sessions.session_nonce` (random UUID generated per session, never shared publicly).  
Algorithm: HMAC-SHA-256, output as lowercase hex.  
Comparison: timing-safe byte-by-byte XOR (`timingSafeEqual`) to prevent timing-oracle attacks.

---

### Database Schema

#### `game_sessions`
| Column | Type | Description |
|---|---|---|
| `token` | uuid | Public session identifier |
| `session_nonce` | text | HMAC signing key (random UUID) |
| `pow_challenge` | text | PoW puzzle string |
| `pow_difficulty` | int | Required leading zero bits (currently 18) |
| `last_seq` | int | Most recently accepted sequence number |
| `last_score` | int | Server-authoritative score at last heartbeat |
| `last_level` | int | Server-authoritative level at last heartbeat |
| `last_asteroids` | int | Server-authoritative asteroidsDestroyed at last heartbeat |
| `last_bullets` | int | Server-authoritative bulletsFired at last heartbeat |
| `last_heartbeat_at` | timestamptz | Wall-clock time of last accepted heartbeat |
| `heartbeat_count_minute` | int | Heartbeats in the current 60 s rate-limit window |
| `heartbeat_window_start` | timestamptz | Start of current rate-limit window |
| `submission_count` | int | Number of scores submitted (max 1) |
| `expired` | bool | True after submission or session timeout |
| `started_at` | timestamptz | Session creation time |

#### `game_session_checkpoints`
| Column | Type | Description |
|---|---|---|
| `session_token` | uuid | References `game_sessions.token` |
| `score` | int | Score at checkpoint |
| `level` | int | Level/wave at checkpoint |
| `asteroids_destroyed` | int | Cumulative asteroid count |
| `bullets_fired` | int | Cumulative bullet count |
| `seq` | int | Sequence number |
| `reported_at` | timestamptz | Server receipt time |

#### `submission_flags`
| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `score_id` | uuid | References `current_high_scores` |
| `flag_type` | text | e.g. `checkpoint_clustering`, `temporal_cluster` |
| `severity` | text | `low`, `medium`, or `high` |
| `reasoning` | text | Human-readable explanation |
| `admin_override` | bool | Admin has reviewed and cleared this flag |
| `created_at` | timestamptz | When the flag was recorded |

#### `rejected_submissions`
| Column | Type | Description |
|---|---|---|
| `session_token` | text | Session associated with the rejected run |
| `initials` | text | Submitted initials |
| `score` | int | Submitted score |
| `level` | int | Submitted wave/level |
| `code` | text | Machine-readable rejection reason |
| `message` | text | Human-readable rejection reason |
| `detail` | jsonb | Validation details captured at rejection |
| `origin` | text | Request origin |
| `user_agent` | text | Request user agent |
| `approved` | bool | Whether an admin approved the run |
| `created_at` | timestamptz | When the rejection was recorded |

#### `current_high_scores` CHECK Constraints
Database-level `CHECK` constraints enforce valid ranges for `score` (0–9 999 999), `initials` format (1–3 uppercase A-Z), `level`, and `time_played_seconds`.

---

### What This Protects Against

✅ Browser console score manipulation  
✅ Direct Supabase client API calls  
✅ Automated bot submissions (PoW + burst detection + entropy checks)  
✅ Replay attacks (monotonic seq + CAS updates)  
✅ Forged/tampered fields in transit (HMAC signing)  
✅ Physically impossible scores (time-based and level-based caps)  
✅ Fake gameplay with no heartbeats (heartbeat requirement)  
✅ Duplicate score spam (1-hour deduplication window)  
✅ Cross-session replay of identical gameplay (fingerprinting)  
✅ Post-heartbeat score injection (final score cross-check)  
✅ Machine-like uniform scoring patterns (entropy analysis)  
✅ Requests from unexpected origins (origin allowlist)  

### What This Does NOT Protect Against

⚠️ A sophisticated attacker who can read memory of the running browser process, intercept the HMAC key, and reconstruct perfectly valid-looking heartbeats with a manipulated score trajectory — this would require defeating the entropy, delta, and plausibility checks simultaneously  
⚠️ Collusion where a legitimate player knowingly plays slowly to build up valid heartbeats, then attempts a large final-score submission (partially mitigated by the final-score cross-check, which flags a final jump of more than 60 000 points since the last heartbeat)

---

### Reporting Security Issues

If you discover a security vulnerability in the highscore system or any other part of the application, please:

1. **Do not** publicly disclose the vulnerability
2. Contact the repository maintainer privately
3. Provide detailed information about the vulnerability
4. Allow time for a fix before public disclosure

---

### Changelog

#### 2026-10-04: Rejected-submission review
- Added the admin approve endpoint
- Added Layer 22 for rejected-submission logging and review
- Added client-side retries for session starts and score submissions

#### 2026-10-03: Score limits rebuilt
- Set the hard ceiling to 10 000 points per second plus a 100 000-point burst allowance
- Changed statistical checks to flag instead of reject
- Added the `rejected_submissions` log

#### 2026-03-27: Security Documentation Expanded
- Documented all 21 security layers in detail
- Added HMAC format reference table
- Added full database schema for security-relevant tables
- Clarified PoW, CAS, sequence numbers, entropy analysis, and cross-session fingerprinting

#### 2026-03-24: Content Restrictions Removed & Behavioral Analysis Added
- Removed profanity/content filter — any valid A-Z initials now accepted
- Added wave consistency check (rejects impossible level jumps between checkpoints)
- Added high-score minimum play duration requirements
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

