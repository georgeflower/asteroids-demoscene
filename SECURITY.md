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
- **Score rate analysis**: Score per second must not exceed the physical game maximum
- **High-score play duration**: Scores ≥ 50,000 require ≥ 300 seconds of play time
- **Wave consistency check**: Impossible level jumps (>5 waves) between heartbeat checkpoints are rejected
- **Checkpoint gap detection**: Heartbeat gaps > 90 seconds are rejected for high-score sessions
- **Checkpoint clustering detection**: Flags sessions where all checkpoints are suspiciously bunched at the start
- **Temporal anomaly detection**: Flags identical score/initials pairs submitted within 5 minutes across sessions

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
Located in `/supabase/functions/submit/index.ts`

**Endpoints:**
- `POST /start-session` — Creates a new game session and returns a token
- `POST /heartbeat` — Records a gameplay checkpoint (score + wave)
- `POST /submit` — Validates and submits a score with session token
- `GET /admin-data` — Returns scores, flags, and audit logs (requires `x-admin-key`)
- `POST /admin-delete` — Removes a score by ID (requires `x-admin-key`)

**Request Format (submit):**
```json
{
  "initials": "ABC",
  "score": 12345,
  "gameSessionToken": "uuid-token",
  "timestamp": 1234567890,
  "level": 5,
  "source": "game_client"
}
```

**Error Responses:**
- `400` — Invalid request format or missing fields
- `403` — Invalid session token, session expired, or score plausibility failure
- `409` — Duplicate score detected
- `500` — Server error

### Admin Monitoring Dashboard

A development-only admin dashboard is available in `src/components/AdminMonitor.tsx`.

**Access — Debug Mode (recommended):**
1. Press `Ctrl+Shift+D` on any page to toggle debug mode
2. A small `⚙ DEBUG` badge appears in the bottom-right corner
3. Click **OPEN ADMIN** in the debug panel to mount the admin dashboard
4. Enter your `ADMIN_SECRET_KEY` when prompted

Debug mode state is persisted in `localStorage` (`asteroids_debug` key) so it survives page reloads.

**Access — Manual (console):**
1. Open browser console on the game site
2. `localStorage.setItem('asteroids_admin', 'true')`
3. The `<AdminMonitor />` component renders over the game
4. Enter your `ADMIN_SECRET_KEY` when prompted

**Features:**
- Real-time list of recent scores with flag severity highlighted
- Expand any row to see session token (masked), submission method, and flag reasoning
- One-click score removal
- Filter to flagged-only submissions
- Export submissions as CSV

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
| Constraint | Rule |
|------------|------|
| `check_score_non_negative` | `score >= 0` |
| `check_score_max` | `score <= 9999999` (9,999,999) |
| `check_initials_format` | `initials ~ '^[A-Z]{1,3}$'` |
| `check_level_valid` | `level IS NULL OR level BETWEEN 1 AND 30` |
| `check_time_played` | `time_played_seconds IS NULL OR time_played_seconds >= 0` |

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

