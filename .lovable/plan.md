

# Fix: Extra Life Cap Feedback

## Problem
The extra life cap logic (lines 1922-1927) is **correctly preventing** `state.lives` from increasing beyond the cap. However, the **floating text** "+1 LIFE!" (line 1910) and the **power-up sound** (line 1934) fire every time an `extraLife` power-up is collected, regardless of whether the cap blocked it. This makes it appear the player received the life when they didn't.

## Solution

Two changes in `src/pages/Game.tsx`:

1. **Move the "+1 LIFE!" floating text inside the cap check** so it only shows when the life is actually granted. When capped, show "MAX LIVES!" (or similar) in a muted color instead.

2. **Prevent `extraLife` power-ups from spawning** when the cap is already reached. In `createPowerUp` (line 766), check `state.extraLivesThisWave` against the cap and exclude `extraLife` from the random pool if maxed. This avoids the confusion of collecting a useless power-up entirely.

### Detailed changes

**`createPowerUp` function (~line 766):** Filter out `"extraLife"` from the `types` array when `state.extraLivesThisWave >= maxExtraLives` for the current wave.

**Power-up pickup switch (~line 1910-1928):** Move the floating text label selection into each case branch. For `extraLife`, only show "+1 LIFE!" if the cap allows it; otherwise show "MAX EXTRA LIVES!" in gray.

**Boss power-up drop (~line 2094-2098):** Apply the same filter to exclude `extraLife` from boss drops when capped.

