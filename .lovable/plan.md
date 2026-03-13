

# Extra Life Cap + Difficulty Scaling Fix

## Changes (all in `src/pages/Game.tsx`)

### 1. Speed scaling formula (line 231)
Change `getSpeedScale` from `1.1 + wave * 0.03` to `1.0 + (wave - 1) * 0.05` so level 1 = 100%, level 2 = 105%, level 3 = 110%, etc.

### 2. Track extra lives earned per wave
Add `extraLivesThisWave: number` to the `GameState` interface and initialize to `0`. Reset it to `0` in `nextWave()`.

### 3. Cap extra lives per level
In the extra life check (~line 1878), before granting the life, calculate the max allowed for the current wave:
- Waves 1-3: max 1
- Waves 4-6: max 2
- Waves 7+: max 3

Only grant the life if `state.extraLivesThisWave < max`, then increment the counter.

