

# Add Debug Score Cheat (X key = +100,000 points)

Add a debug-only hotkey: pressing `X` during solo gameplay adds 100,000 points to the current score. Gated behind `DEBUG_ENABLED`.

## Change

**`src/pages/Game.tsx`** — In `handleCanvasKeyDown`, after the existing level-skip cheat block (~line 3135), add:

```typescript
// Add 100k points with X key (solo only, debug only)
if (
  DEBUG_ENABLED &&
  (e.key === "x" || e.key === "X") &&
  gameModeRef.current === "solo" &&
  gameStateRef.current &&
  !gameStateRef.current.gameOver &&
  !isPausedRef.current
) {
  e.preventDefault();
  gameStateRef.current.score += 100000;
  setDisplayScore(gameStateRef.current.score);
  addDebugLog("wave", `+100,000 points cheat (now ${gameStateRef.current.score})`);
  return;
}
```

Single insertion, no other files affected. The `DEBUG_ENABLED` flag in `src/constants/debug.ts` remains `false` — flip to `true` when needed.

