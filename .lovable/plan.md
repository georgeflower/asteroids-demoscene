

## Plan: Gamepad Support and 2-Player Duel Mode

### 1. Gamepad/Joystick Support
Add Gamepad API polling in the game loop:
- Poll `navigator.getGamepads()` every frame
- Map standard gamepad layout: left stick/d-pad for rotation + thrust, button 0 (A/X) for fire, button 1 (B/Circle) for hyperspace
- **No sticky inputs**: Read axis/button state fresh each frame — no keydown/keyup events, so releasing a button or stick instantly stops the action
- For shooting, use the same fire-rate limiter already in place; only fire when button is actively pressed
- Works alongside keyboard controls (both active simultaneously)
- Support gamepad indices 0 and 1 for player 1 and player 2

### 2. Two-Player Duel Mode
Add a mode selection screen before the game starts:
- **Menu**: "SOLO" and "DUEL" buttons on the game page (replaces auto-start)
- **Duel mode state**: Two ships, two score trackers (kills/deaths per player), shared asteroids and enemies (reduced count), no lives system
- Each player has their own ship, bullets, and kill/death counters
- **Player 1**: Arrow keys + Space (or Gamepad 0)
- **Player 2**: WASD + E to fire (or Gamepad 1)
- Player bullets can hit the other player's ship — respawn after 2 seconds of invulnerability at a random position
- Asteroids and a few aliens still spawn for environmental hazard but at reduced rates
- **HUD**: Show "P1 KILLS: X DEATHS: Y" and "P2 KILLS: X DEATHS: Y" instead of score/lives/wave
- Ships drawn in different colors (P1 = cyan, P2 = orange)
- **No game over** — plays indefinitely; players can quit with a "QUIT" button overlay
- The `gameMode` state (`"solo" | "duel"`) determines which update/draw/collision logic runs

### 3. Data Model Changes
```typescript
type GameMode = "menu" | "solo" | "duel";

interface DuelState {
  ship1: Ship;
  ship2: Ship;
  bullets1: Bullet[];  // P1's bullets
  bullets2: Bullet[];  // P2's bullets
  kills: [number, number];
  deaths: [number, number];
  respawnTimer: [number, number];
}
```
Add `gameMode` state and `duelState` ref alongside existing `gameStateRef`. Solo mode is unchanged.

### 4. Gamepad Polling (both modes)
```typescript
// In update(), before reading keys:
const gamepads = navigator.getGamepads();
const gp0 = gamepads[0]; // axes[0] left/right, axes[1] up/down, buttons[0] fire, buttons[1] hyperspace
```
Axes have a deadzone of 0.2. Thrust triggers when axis[1] < -0.2 or left stick pushed up. Rotation from axis[0]. All reads are instantaneous — no state carried between frames.

### 5. Files Changed
- `src/pages/Game.tsx` — All changes: gamepad polling, mode selection menu, duel state management, dual ship rendering, PvP collision logic, separate key bindings for P2

