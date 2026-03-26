

# Plan: Enhanced Anti-Cheat — Proof-of-Work + Signed Game State

## Problem

An attacker who understands the validation rules can automate the full edge function lifecycle (`/start-session` → `/heartbeat` × N → `/submit`) with crafted-but-plausible payloads, bypassing all current checks. The ZOI score (133,337) demonstrates this.

## New Measures

### 1. Proof-of-Work Challenge (server-issued)

When `/start-session` is called, the server generates a random `challenge` string and a `difficulty` (number of leading zero bits required in the hash). The client must find a `nonce` such that `SHA-256(challenge + nonce)` has the required leading zeros. The solution is submitted with each `/heartbeat` and the final `/submit`.

- **Why it works**: Adds real CPU cost to automated submissions. A bot must burn compute time per session, making mass-fake-score attacks expensive.
- **Difficulty**: Set low enough that a real browser solves it in ~2-3 seconds (e.g., 18-bit difficulty). Solved during the game's opening animation, so players never notice.
- **Storage**: `game_sessions` table gets `pow_challenge` and `pow_difficulty` columns. Solution is verified server-side on `/submit`.

### 2. Server-Signed Session Nonce (HMAC binding)

At session start, the server generates a `session_nonce` (random bytes) and returns it to the client. The client must include an HMAC signature of `session_token + score + level` using this nonce in each heartbeat and the final submission. The server recomputes and verifies.

- **Why it works**: An attacker can't just replay or forge heartbeats without knowing the nonce. While the nonce is sent to the client (so a sophisticated attacker could extract it), it raises the bar significantly — they must reverse-engineer the HMAC construction, not just POST JSON.
- **HMAC algorithm**: SHA-256 via Web Crypto API (browser) / Deno crypto (server).

### 3. Enriched Heartbeat Payloads

Require additional game-state metrics in each heartbeat that are hard to fabricate consistently:
- `asteroidsDestroyed` (cumulative count)
- `bulletsFired` (cumulative count)  
- `accuracy` (hits / shots ratio)

The server validates these for internal consistency across checkpoints (e.g., asteroids destroyed must increase monotonically, accuracy must be between 0-1, bullets fired must be proportional to time played).

### 4. Scaled Checkpoint Requirements

Instead of a flat minimum of 2 checkpoints for scores ≥ 50k, scale the requirement:
- 50k+: min 3 checkpoints
- 100k+: min 6 checkpoints
- 200k+: min 10 checkpoints
- 500k+: min 20 checkpoints

This makes high-score forgery require maintaining a long, internally-consistent heartbeat chain.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/submit/index.ts` | Add PoW verification, HMAC verification, enriched heartbeat validation, scaled checkpoint requirements |
| `src/pages/Game.tsx` | Add PoW solver during game init, compute HMAC for heartbeats/submit, send enriched game stats in heartbeats |
| **Migration** | Add `pow_challenge`, `pow_difficulty` columns to `game_sessions`; add `asteroids_destroyed`, `bullets_fired` columns to `game_session_checkpoints` |

## Technical Details

### PoW solver (client-side, runs in background)
```text
1. Receive { challenge, difficulty } from /start-session
2. Spawn a loop: increment nonce, compute SHA-256(challenge + nonce)
3. Check if hash has `difficulty` leading zero bits
4. Store solution; attach to /submit payload
```

### HMAC construction
```text
key = session_nonce (from /start-session)
message = sessionToken + "|" + score + "|" + level
signature = HMAC-SHA256(key, message)
```

### Enriched heartbeat payload
```json
{
  "gameSessionToken": "...",
  "score": 12345,
  "level": 3,
  "asteroidsDestroyed": 47,
  "bulletsFired": 203,
  "hmac": "abc123..."
}
```

