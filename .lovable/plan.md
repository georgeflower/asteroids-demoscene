

# Plan: Show Both Leaderboards on Menu + Nerf Green Enemy

## 1. Show both local and cloud high scores on main menu

Currently, the menu shows either cloud leaderboard (when `HIGH_SCORES_ENABLED`) or local high scores — never both. Change this so both are displayed side-by-side when cloud is enabled and local scores exist.

**File**: `src/pages/Game.tsx`

- Keep the existing cloud "★ TOP SCORES ★" block (lines 5608-5649) as-is
- Remove the `!HIGH_SCORES_ENABLED &&` condition from the local high scores block (line 5672), so it renders whenever `localHighScores.length > 0`
- Rename the local block header to "★ LOCAL HIGH SCORES ★" (already is)
- Both blocks will stack vertically: cloud on top, local below

## 2. Increase green enemy spawn interval

Currently all alien types share one spawn timer (line 2643): `Math.max(180, 500 - wave * 20) + random * 200`. After spawning a greenMan, add an extra cooldown so they appear less frequently.

**File**: `src/pages/Game.tsx` (line 2629-2632)

Add a separate longer cooldown after greenMan spawn:
```typescript
if (state.wave >= 6 && state.aliens.filter((a) => a.type === "greenMan").length < 2) {
  state.aliens.push(createAlien("greenMan", state.wave));
  // Extra cooldown for green enemy spawns
  state.alienSpawnTimer += 300;
}
```

## 3. Reduce green enemy aim accuracy by 10%

Currently (line 2679), the greenMan shoots directly at the player with perfect aim:
```typescript
const angle = Math.atan2(state.ship.pos.y - alien.pos.y, state.ship.pos.x - alien.pos.x);
```

Add angular spread to reduce accuracy:
```typescript
const baseAngle = Math.atan2(state.ship.pos.y - alien.pos.y, state.ship.pos.x - alien.pos.x);
const angle = baseAngle + (Math.random() - 0.5) * 0.35; // ~10% less accurate (~20° spread)
```

## Technical Details

### Files changed
- `src/pages/Game.tsx` — 3 small edits:
  1. Line 5672: remove `!HIGH_SCORES_ENABLED &&` condition
  2. Line 5708: remove `!HIGH_SCORES_ENABLED &&` condition for the overlay too
  3. Lines 2629-2632: add `state.alienSpawnTimer += 300` after greenMan spawn
  4. Line 2679: add angular spread to greenMan aim

