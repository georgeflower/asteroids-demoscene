

# Plan: localStorage High Score List + Fix Build Errors

## Overview

Add a local-only high score list stored in `localStorage`, displayed on the main menu and game over screen. This is independent of the server-side leaderboard (which remains disabled). Also fix all current build errors.

## Changes

### 1. Fix build errors in `supabase/functions/submit/index.ts`

Replace 6 occurrences of `payload.gameSessionToken` with `payload.token` (the field was renamed in the robust parsing step but log statements still reference the old name).

### 2. Fix build error in `src/hooks/useMultiplayer.ts`

Cast presence objects in `.filter()` callbacks to `PresenceInfo` using `as unknown as PresenceInfo` or type the filter parameter as `any` since the Supabase Presence type doesn't include custom fields.

### 3. Fix build error in `src/pages/Game.tsx` line 4623

Add `hyperspace: false` as default in the fallback object (`InputState` has `hyperspace` as optional but the target type requires it).

### 4. Add localStorage high score system

In `Game.tsx`:

- Add a new constant `LOCAL_SCORES_KEY = "asteroids_local_highscores"`
- Add state: `localHighScores` — array of `{ initials: string; score: number; date: string }`
- On mount, load from localStorage (starts empty since key won't exist yet)
- `isHighScore` checks against `localHighScores` (top 10)
- On game over with a qualifying score, show initials entry (reuse existing `enteringInitials` flow)
- On submit, save to localStorage (insert sorted, keep top 10), no server call
- Display top 3 on main menu (replacing the "HIGH SCORES ARE DISABLED" message)
- Display in the game over screen
- Show "TOP:" on canvas HUD from local scores
- Add "CLEAR SCORES" button in the full leaderboard overlay

This reuses all existing UI patterns (initials entry, leaderboard display) but routes through localStorage instead of the server.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/submit/index.ts` | Fix 6 `payload.gameSessionToken` → `payload.token` |
| `src/hooks/useMultiplayer.ts` | Fix presence type cast in 3 filter callbacks |
| `src/pages/Game.tsx` | Fix `hyperspace` default; add localStorage highscore system |

