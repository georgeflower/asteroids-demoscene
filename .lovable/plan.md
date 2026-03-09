

## Plan: Menu Enhancements, Music Setting, and Input Capture

### 1. Show Top 3 High Scores on Main Menu + Link to Full Leaderboard

On the menu screen (gameMode === "menu"), add a "TOP SCORES" section showing the top 3 from the `leaderboard` state (already loaded on mount). Add a clickable "VIEW ALL SCORES" link that opens a full leaderboard overlay (or toggles `showLeaderboard` state).

### 2. Floating Top Score in Top-Right During Gameplay

During solo gameplay, render the #1 leaderboard score in the top-right corner of the canvas (drawn in the render loop), e.g. "TOP: 00012345". This uses the existing `leaderboard[0]?.score` value.

### 3. Auto-Play Music Setting

Add a `autoPlayMusic` state (persisted to localStorage). Show a toggle/checkbox below the radio player on both the menu and game screens: "AUTO-PLAY MUSIC". When unchecked, the `<audio>` element will not have `autoPlay` and will be muted/paused. The audio element's `autoPlay` prop becomes conditional on this setting. Sound effects remain unaffected.

### 4. Input Capture on Game Canvas (Pointer Lock)

When the game starts (solo/duel/online), call `canvasRef.current.requestPointerLock()` to capture mouse focus, and use `tabIndex={0}` + `canvasRef.current.focus()` to capture keyboard events on the canvas element instead of `window`. Release pointer lock on ESC (which also toggles pause) or gamepad Start button. This prevents clicks/keys from hitting elements outside the canvas.

**Implementation approach**: 
- Move `keydown`/`keyup` listeners from `window` to the canvas element
- On game start (`initGame`, `initDuel`, `initOnline`), call `canvas.focus()` 
- Add `tabIndex={0}` and `outline-none` to canvas
- ESC releases focus (already toggles pause). Gamepad B in pause menu quit also releases.
- On `quitToMenu`, blur the canvas

### Technical Changes

**File: `src/pages/Game.tsx`**

- Add state: `autoPlayMusic` (boolean, default from localStorage), `showFullLeaderboard` (boolean)
- Menu screen: Insert top 3 scores list + "VIEW ALL" link + full leaderboard modal
- Menu & game screen: Make `<audio autoPlay>` conditional on `autoPlayMusic`
- Add checkbox/toggle for auto-play music setting below radio section
- Canvas: add `tabIndex={0}`, `outline: 'none'`; move key listeners to canvas ref
- Solo render loop: draw top score text in top-right
- On `initGame`/`initDuel`/`initOnline`: focus canvas
- On ESC (when not in game) or `quitToMenu`: blur canvas
- On pause: canvas keeps focus; on quit: blur

