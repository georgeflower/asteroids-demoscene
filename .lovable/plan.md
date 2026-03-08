

## Plan: Life Lost Screen + Mobile Touch Controls

### 1. Life Lost Screen
When the player loses a life (but still has lives remaining), pause the game and show an overlay:
- "LIFE LOST!" text
- "Press to Continue" button
- New state: `showLifeLost` (boolean)
- On life loss (ship vs asteroid/UFO collisions, hyperspace malfunction), if lives > 0, set `showLifeLost = true` and pause the game
- On button press (or tap), dismiss overlay and resume

Affected areas in `update()`:
- Ship vs Asteroids collision (~line 543-558)
- Ship vs UFOs collision (~line 566-582)
- Hyperspace malfunction (~line 298-312)

### 2. Mobile Touch Controls
Industry standard dual-stick / button layout for mobile arcade games:

**Left side**: Directional controls
- Left rotate button (bottom-left)
- Right rotate button (bottom-left, next to it)

**Right side**: Action buttons
- Thrust button (large, right side)
- Fire button (large, right side)
- Hyperspace button (smaller, right side)

Implementation:
- Render touch control buttons below the canvas (or as an overlay on mobile)
- Use `onTouchStart` / `onTouchEnd` events to set `keysRef.current` values (same as keyboard)
- Use `useIsMobile()` hook to show controls only on touch devices (or always show them since this is a game)
- Use `touch-action: none` and `user-select: none` to prevent scrolling/selection
- Support multi-touch (multiple buttons pressed simultaneously) via individual button touch handlers

### UI Layout (mobile)
```text
┌─────────────────────────────┐
│  SCORE   LIVES   WAVE       │
├─────────────────────────────┤
│                             │
│        GAME CANVAS          │
│                             │
├─────────────────────────────┤
│  ◄   ►        THRUST  FIRE │
│          HYPERSPACE         │
└─────────────────────────────┘
```

### Files Changed
- `src/pages/Game.tsx` — Add `showLifeLost` state, pause logic on life loss, life lost overlay UI, and mobile touch control buttons

