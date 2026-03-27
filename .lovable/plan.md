

# Plan: Server-Side Heartbeat Timing Validation, HMAC Hardening & Build Obfuscation

## Summary

Three changes: (1) add server-side timing validation to detect burst-sent heartbeats, (2) include `asteroidsDestroyed` and `bulletsFired` in the HMAC signature so attackers can't tamper with them, and (3) add code obfuscation to the Vite build.

## Problem Assessment

The security researcher's analysis is accurate on two points:

1. **HMAC signs only `token|score|level`** — `asteroidsDestroyed` and `bulletsFired` are unsigned, so an attacker can modify them freely without invalidating the signature.
2. **Session nonce is delivered to client** — this is inherent to client-side games. The HMAC serves as session binding (proving the submission came from the session that received the nonce), not as a secret. The real protection is the server-side behavioral validation (entropy checks, plausibility caps, checkpoint analysis).

The existing `MIN_HEARTBEAT_INTERVAL_MS = 10000` check already rate-limits heartbeats, but it doesn't detect burst patterns (e.g., 10 heartbeats sent 11s apart but all in 2 minutes to fake a long session).

## Changes

### 1. Expand HMAC to include all validated fields

**Client** (`src/pages/Game.tsx`): Change HMAC message to include all fields:
```
`${token}|${score}|${level}|${asteroidsDestroyed}|${bulletsFired}`
```

**Server** (`supabase/functions/submit/index.ts`): Update HMAC verification in `handleHeartbeat` to verify the expanded message. Also update the submit HMAC to match.

This prevents attackers from modifying `asteroidsDestroyed`/`bulletsFired` without invalidating the signature.

### 2. Server-side heartbeat timing validation

Add to `handleHeartbeat` in the edge function:

- **Burst detection**: After inserting a checkpoint, query all checkpoints for this session. If 5+ checkpoints exist, check the time span from first to last. If the average interval is suspiciously close to the minimum (e.g., all exactly 10-11s apart with no variance), flag the session. Real 30-second intervals have natural jitter.
- **Server timestamp enforcement**: Already using `reported_at` (server-side `now()`), so the attacker can't fake timestamps. The existing `MIN_HEARTBEAT_INTERVAL_MS` check uses server timestamps.
- **Add sequence number**: Add a `seq` field to heartbeats. Client sends incrementing seq (1, 2, 3...). Server validates `seq = last_seq + 1`. This prevents replay of individual heartbeats.

### 3. Vite build obfuscation

Update `vite.config.ts` to add Terser-based obfuscation:

```typescript
build: {
  minify: 'terser',
  terserOptions: {
    mangle: {
      toplevel: true,
      properties: {
        regex: /^(gameSessionToken|sessionNonce|asteroidsDestroyed|bulletsFired|powSolution|heartbeat)/,
      },
    },
    compress: {
      drop_console: false, // keep for debugging
      passes: 2,
    },
  },
}
```

This mangles property names matching game-specific patterns, making the minified code harder to reverse-engineer. It won't stop a determined attacker but raises the bar significantly.

### 4. Add `seq` column to `game_session_checkpoints`

Database migration to add a `seq` integer column for replay protection.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Game.tsx` | Expand HMAC message to include all fields; add seq counter to heartbeats |
| `supabase/functions/submit/index.ts` | Verify expanded HMAC; validate seq monotonicity; add burst pattern detection |
| `vite.config.ts` | Add Terser minification with property mangling |
| Migration SQL | Add `seq` column to `game_session_checkpoints` |
| `package.json` | Add `terser` dev dependency |

