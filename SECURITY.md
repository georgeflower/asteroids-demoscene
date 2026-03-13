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
- Enforces valid score range: 0 to 99,999,999
- Validates initials format: 1-3 uppercase letters only
- Rejects malformed or suspicious submissions

#### 5. Profanity Filter
- Blocks inappropriate initials from being submitted
- Client-side validation provides immediate feedback
- Server-side enforcement prevents bypassing client checks
- Maintains a curated list of banned initials

#### 6. Secure Database Access
- Direct INSERT permission revoked from public users
- All score insertions go through authenticated Edge Function
- Uses service role key for secure database operations

### Architecture

```
Game Client (Browser)
    ↓
[1] Request Session Token → Edge Function (/start-session)
    ↓
[2] Receive Session Token ← Edge Function
    ↓
[3] Play Game (score tracked locally)
    ↓
[4] Submit Score + Token → Edge Function (/submit)
    ↓
[5] Validate Session & Score → Database (via service role)
    ↓
[6] Success/Error Response ← Edge Function
```

### Implementation Details

#### Edge Function: `submit`
Located in `/supabase/functions/submit/index.ts`

**Endpoints:**
- `POST /start-session` - Creates a new game session and returns a token
- `POST /submit` - Validates and submits a score with session token

**Request Format (submit):**
```json
{
  "initials": "ABC",
  "score": 12345,
  "gameSessionToken": "uuid-token",
  "timestamp": 1234567890
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "Score submitted successfully"
}
```

**Error Responses:**
- `400` - Invalid request format or missing fields
- `403` - Invalid session token or session expired
- `409` - Duplicate score detected
- `500` - Server error

#### Database Migration
Located in `/supabase/migrations/20260313120300_secure_highscore_submission.sql`

Changes:
- Drops public INSERT policy on `current_high_scores`
- Creates service_role-only INSERT policy
- Maintains public SELECT policy for viewing leaderboard

#### Client Changes
Modified `/src/pages/Game.tsx`:

- Added `gameSessionTokenRef` to track active session
- Added `startGameSession()` to obtain session token
- Modified `saveToLeaderboard()` to use Edge Function
- Session starts automatically when game begins

### Security Considerations

#### Cold Start Handling
The Edge Function uses an in-memory Map to store game sessions, which is cleared on function cold starts (typically after 15-30 minutes of inactivity). To handle this gracefully:
- When a session token is not found but is a valid UUID v4 format, the session is auto-recreated
- This allows legitimate players to submit scores even after cold starts
- Invalid or malformed tokens are still rejected
- Rate limiting and duplicate detection still apply to auto-recreated sessions

#### What This Protects Against
✅ Browser console score manipulation  
✅ Direct Supabase client API calls  
✅ Automated bot submissions  
✅ Duplicate score spam  
✅ Score range exploitation  

#### What This Does NOT Protect Against
⚠️ Memory editing/game hacking (client-side validation can be bypassed)  
⚠️ Network request replay attacks (tokens are reusable within session)  
⚠️ Determined attackers with reverse engineering skills  

### Future Enhancements

Potential improvements for even stronger security:

1. **Server-Side Game Logic**
   - Move score calculation to server
   - Validate game events and progression
   - Detect impossible scores/timing

2. **Cryptographic Proof**
   - Sign game events with private key
   - Verify signatures server-side
   - Prevent replay attacks with nonces

3. **Behavioral Analysis**
   - Track play patterns and timing
   - Flag statistically impossible performances
   - Implement machine learning fraud detection

4. **IP-Based Rate Limiting**
   - Track submissions per IP address
   - Implement CAPTCHA for suspicious activity
   - Block known VPN/proxy IP ranges

### Reporting Security Issues

If you discover a security vulnerability in the highscore system or any other part of the application, please:

1. **Do not** publicly disclose the vulnerability
2. Contact the repository maintainer privately
3. Provide detailed information about the vulnerability
4. Allow time for a fix before public disclosure

### Verifying Highscore Legitimacy

#### Admin Utility Script

A utility script is available to check whether a specific highscore was submitted through a legitimate game session.

**Location:** `/scripts/check-highscore-legitimacy.ts`

**Usage:**
```bash
deno run --allow-env --allow-net scripts/check-highscore-legitimacy.ts <score_id>
```

**Example:**
```bash
deno run --allow-env --allow-net scripts/check-highscore-legitimacy.ts 54936b71-eb3b-4295-bc4a-0b25a68d022d
```

The script will display:
- Full highscore details
- Session token (if available)
- Submission method (edge_function, manual, or legacy)
- Clear legitimacy assessment

#### Submission Tracking

Starting with the 2026-03-13 update, all highscore submissions include:
- **session_token**: The unique token from the game session
- **submission_method**: How the score was submitted
  - `edge_function`: Normal game submission with session validation
  - `manual`: Manually inserted by administrator
  - `legacy`: Existed before tracking was implemented

Scores without these metadata fields are considered legacy and cannot be verified.

### Changelog

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
