

# Fix FPS Counter + Increase Game Speed

## 1. FPS shows 0/0 — Bug Fix

The `_fps.frames++` counter increment on line 2697-2700 is gated behind `if (DEBUG_ENABLED)`. Since FpsOverlay now renders always (not just in debug), the counters never increment in production → always 0.

**Fix**: Remove the `DEBUG_ENABLED` guard around `_fps.frames++` and `_fps.updates += updatesThisFrame` (lines 2696-2700) so counters always increment.

## 2. Speed Adjustments

Current speed scale formula (line 231):
```
getSpeedScale = (wave) => 1 + wave * 0.05   // starts at 1.0, +5% per wave
```

Change to:
```
getSpeedScale = (wave) => 1.1 + wave * 0.03  // starts at 1.1 (10% higher), +3% per wave
```

This gives 10% higher base speed and 3% increase per level as requested.

