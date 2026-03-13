

# Fix: Settings from Pause Menu

## Problem
Clicking "SETTINGS" in the pause menu calls `resumeGame()` then `setShowSettings(true)`. This unpauses and resumes the game loop in the background. The settings overlay does render (it's not gated by `isPaused`), but the game is running underneath, consuming input and making it seem like settings never appeared.

## Solution
**Don't call `resumeGame()`** when opening settings from pause. Instead, just show the settings overlay while staying paused. When settings closes (save or cancel), remain paused so the player returns to the pause menu.

### Changes in `src/pages/Game.tsx`

1. **Pause menu Settings button onClick** (~line 3992): Change from `{ resumeGame(); setShowSettings(true); }` to just `setShowSettings(true)`.

2. **Keyboard handler for pause menu** (~line 3169): Same change — `else if (s === 1) { setShowSettings(true); }` (remove `resumeGame()`).

3. **Gamepad handler for pause menu** (~line 3287): Same change.

