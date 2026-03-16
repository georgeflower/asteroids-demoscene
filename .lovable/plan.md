

## Problem

There are still **three places** in `Game.tsx` that cap extra lives per wave:

1. **`createPowerUp` function** (line 901-907) — filters out `extraLife` from power-up types when `extraLivesThisWave >= maxExtraLives`
2. **Score milestone bonus** (line 2461-2468) — only grants a bonus life every 10,000 points if `extraLivesThisWave < maxExtraLives`
3. **Boss drop** (line 2570-2574) — filters out `extraLife` from boss drops when capped

Plus the `extraLivesThisWave` state field and its reset on wave change are now unnecessary.

## Plan

1. **Simplify `createPowerUp`** — Remove the `extraLivesThisWave` parameter and the filtering logic. Always include `extraLife` in the power-up pool.

2. **Remove score milestone cap** — The 10,000-point bonus life should always be granted (remove the `maxExtraLives` check, keep the life increment).

3. **Remove boss drop filtering** — Always include `extraLife` in boss drop types.

4. **Clean up state** — Remove `extraLivesThisWave` from the `GameState` interface, its initialization, its reset on wave change, and all call sites that pass it to `createPowerUp`.

5. **Update changelog text** (line ~4498-4500) — Remove the "Extra Life Cap" description.

All changes are in `src/pages/Game.tsx` only.

