

## Plan: Debug Logging System, Trainer Mode, and Level Skip

### 1. Create Constants File (`src/constants/debug.ts`)

New file with a single `DEBUG_ENABLED` flag (default `false`). User can manually toggle to `true` to enable all debug features.

### 2. Debug Logger System

- Add a `DebugLog` interface with `{ timestamp, category, message }` entries
- Categories: `collision`, `spawn`, `wave`, `powerup`, `death`, `boss`, `input`
- State: `debugLogs` array (capped at 200), `showDebugPanel` boolean, `debugCategories` set of enabled categories
- Toggle panel with `§` key (canvas keydown handler) or a transparent floating button on mobile
- Panel: semi-transparent overlay on the canvas listing filtered log entries, with checkboxes for each category
- All debug UI and logging calls gated behind `DEBUG_ENABLED` import

### 3. Trainer Mode

- Add `trainerMode` state (persisted to localStorage), gated behind `DEBUG_ENABLED`
- Show a checkbox in the options area (below auto-play music) when debug is enabled: "TRAINER (NO SCORES)"
- When trainer enabled: skip `loseLife()` calls (ship stays invulnerable), disable score saving to leaderboard
- Display "TRAINER" badge on HUD when active

### 4. Level Skip (press `0`)

- In canvas keydown handler, when `DEBUG_ENABLED` and key is `"0"`, call `nextWave()` (solo mode only)
- Log the skip in debug log

### 5. Fix Build Error

- Fix `supabase/functions/scenestream-proxy/index.ts` line 34: cast `error` to `Error` type

### Technical Details

**Files to create:**
- `src/constants/debug.ts`

**Files to edit:**
- `src/pages/Game.tsx` — add debug state, logger calls at collision/spawn/death points, debug panel overlay, trainer checkbox, `§` and `0` key handlers
- `supabase/functions/scenestream-proxy/index.ts` — fix TS error on line 34

### Scope of debug log insertion points in Game.tsx:
- `loseLife()` — log death event
- Bullet vs asteroid/UFO/alien/boss collisions — log collision events  
- `nextWave()` — log wave transition
- Power-up pickup — log powerup event
- Alien/UFO/boss spawn — log spawn event
- Ship collision with environment — log collision

All wrapped in `if (DEBUG_ENABLED)` checks so zero overhead when disabled.

