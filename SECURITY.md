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

Every heartbeat is checked against the server-authoritative state from the previous heartbeat. All deltas are measured over the real elapsed wall-clock time (`dtSec`):

| Metric | Rule |
|---|---|
| Score | Cannot decrease; delta ≤ 1 000 pts/s |
| `asteroidsDestroyed` | Cannot decrease; delta ≤ 5/s |
| `bulletsFired` | Cannot decrease; delta ≤ 10/s |
| Level (wave) | Cannot decrease; jump ≤ 5 waves per interval |

Any heartbeat that violates these limits is rejected with an appropriate 400/403 response.

---

### Layer 8 — Heartbeat Rate Limiting

- **Absolute minimum gap**: 5 000 ms between any two heartbeats.
- **Per-minute cap**: at most 6 heartbeats per 60-second sliding window.
- Requests that exceed these limits receive `429 Too frequent` / `429 Rate limit exceeded`.

---

### Layer 9 — Burst / Timing Pattern Detection

After a session accumulates 5 or more checkpoints, the Edge Function analyses inter-checkpoint timing. If the **standard deviation** of gaps is below 500 ms **and** the **mean** gap is below 15 000 ms, the pattern is considered machine-like. The session is immediately expired and the heartbeat is rejected with `403 Suspicious timing pattern`.

---

### Layer 10 — Proof of At Least One Heartbeat

The `/submit` endpoint requires `game_sessions.last_heartbeat_at` to be non-null. A score submitted with no heartbeat history at all (e.g. a freshly created token sent directly to `/submit`) is rejected with `403 Insufficient gameplay data`.

---

### Layer 11 — Score Plausibility (time and level)

At submission time the server calculates `serverTimePlayedSeconds` from `started_at` to the moment of the request. The submitted score must satisfy all of:

- `score ≤ serverTimePlayedSeconds × 1 000` (max 1 000 pts/s over session lifetime)
- `serverTimePlayedSeconds ≥ 10` (absolute minimum play time)
- If `score ≥ 50 000`: `serverTimePlayedSeconds ≥ 300` (5-minute minimum for significant scores)
- If `level` is provided: `score ≤ level × 75 000` (score cap per wave reached)
- If `level == 1`: `score ≤ 15 000`

---

### Layer 12 — Final Score Cross-Check Against Server State

The submitted final score is compared to `last_score` from the most recent heartbeat:

- `score ≤ last_score + (dtSinceLastHeartbeat × 1 000)` — time-based tolerance for score earned between the last heartbeat and game-over.
- For scores above 50 000: `score ≤ last_score + 5 000` — tight cap to prevent post-heartbeat injection of large amounts.

This makes it very difficult to manipulate the final score after the last heartbeat has been accepted.

---

### Layer 13 — Checkpoint Count Requirements

The number of heartbeat checkpoints stored for a session must meet a minimum threshold based on the final score:

| Minimum score | Required checkpoints |
|---|---|
| 500 000 | 20 |
| 200 000 | 10 |
| 100 000 | 6 |
| 50 000 | 3 |
| < 50 000 | 0 |

Scores that do not meet the requirement are rejected with `403 Insufficient gameplay data`.

---

### Layer 14 — Checkpoint Progression Analysis

All stored checkpoints are replayed in order and must satisfy:

- **No checkpoint gap** > 90 seconds between consecutive checkpoints.
- **Level** must not decrease; jump between consecutive checkpoints ≤ 5.
- **Score** delta between consecutive checkpoints ≤ gap × 1 000 pts/s.
- `asteroidsDestroyed` must be non-decreasing across all checkpoints.
- `bulletsFired` must be non-decreasing across all checkpoints.

Any violation causes an immediate rejection.

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

For sessions with 5 or more checkpoints the Edge Function performs two statistical checks:

1. **Score delta coefficient of variation (CV)**: `stdDev / mean` of all positive inter-checkpoint score deltas must be ≥ 0.15. Perfectly uniform scoring (CV < 0.15) is rejected as bot-like.
2. **Points-per-asteroid ratio variance**: When at least 4 asteroid-event intervals are available, the standard deviation of `scoreDelta / asteroidDelta` per interval must be ≥ 5. An impossibly constant points-per-asteroid ratio is rejected.

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

The `/admin-data` (GET) and `/admin-delete` (POST) endpoints require a secret `x-admin-key` request header that must exactly match the `ADMIN_SECRET_KEY` environment variable stored in the Edge Function secrets. Any request with a missing or incorrect key receives `401 Unauthorized`.

The in-browser Admin Monitoring Dashboard (`AdminMonitor.tsx`) is activated by setting `localStorage.asteroids_admin = 'true'` and also requires the correct admin key at runtime.

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
⚠️ Collusion where a legitimate player knowingly plays slowly to build up valid heartbeats, then attempts a large final-score submission (partially mitigated by the final-score cross-check and 5 000-point post-heartbeat tolerance cap)

---

### Reporting Security Issues

If you discover a security vulnerability in the highscore system or any other part of the application, please:

1. **Do not** publicly disclose the vulnerability
2. Contact the repository maintainer privately
3. Provide detailed information about the vulnerability
4. Allow time for a fix before public disclosure

---

### Changelog

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

