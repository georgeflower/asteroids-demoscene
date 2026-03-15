

## Problem

**Infinite reload loop**: `CURRENT_VERSION` in `useVersionCheck.ts` is still `"0.1.8"` while `version.json` serves `"0.1.9"`. Every time the page loads, the hook detects a mismatch, calls `window.location.reload()`, reloads with the same old `"0.1.8"` constant, detects the mismatch again, and loops forever. The network logs confirm this -- version.json is being fetched every ~1 second (rapid reloads) instead of every 3 minutes.

The second issue (screen flashing white on game start) is likely the CRT boot overlay's phase 4 fade-out ending on a white/transparent frame before the game canvas renders. This may be exacerbated by the reload loop.

## Plan

1. **Fix the version mismatch** -- Update `CURRENT_VERSION` in `src/hooks/useVersionCheck.ts` from `"0.1.8"` to `"0.1.9"` to match `version.json` and `GAME_VERSION` in Game.tsx. This stops the infinite reload loop.

2. **Investigate the white flash** -- After fixing the reload loop, the white flash issue should be re-evaluated. If it persists, the CRT boot overlay's `onComplete` callback may need a brief delay or the game canvas background should be set to black before the overlay completes.

