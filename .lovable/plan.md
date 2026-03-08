

# Online Multiplayer with Web Worker for Game Simulation

## Overview

Add an "Online Duel" mode using a **Web Worker** to run the authoritative game simulation off the main thread, eliminating jank. Supabase Realtime Broadcast handles networking. The host's worker runs physics; the guest sends inputs and receives state.

## Architecture

```text
┌─ Main Thread (both players) ─────────────────────┐
│  React UI, Canvas rendering, Input capture        │
│  Supabase Realtime channel (send/receive)         │
└───────────┬───────────────────────────┬───────────┘
            │ postMessage               │ postMessage
┌───────────▼───────────────────────────▼───────────┐
│  Web Worker (HOST only)                            │
│  - Runs duel physics at fixed 60fps tick          │
│  - Receives P1 + P2 inputs                        │
│  - Broadcasts compressed state every 3 ticks      │
│  - Handles collisions, spawns, scoring            │
└───────────────────────────────────────────────────┘
```

**Guest flow**: Captures local inputs → sends via Realtime channel to host → host worker processes → host broadcasts state via channel → guest renders with interpolation.

## Implementation Plan

### 1. Create Game Simulation Worker
**New file: `src/workers/gameWorker.ts`**

- Extract duel physics logic (ship movement, bullet updates, asteroid updates, collision detection, scoring) into a pure Worker
- Worker accepts messages: `{ type: 'init' }`, `{ type: 'inputs', p1: InputState, p2: InputState }`, `{ type: 'pause' | 'resume' }`
- Worker posts back: `{ type: 'state', data: CompressedGameState }` every tick
- Runs a `setInterval` at ~16ms (60fps) internally
- Shared interfaces for `InputState` and `CompressedGameState` in a new `src/types/multiplayer.ts`

### 2. Create Multiplayer Hook
**New file: `src/hooks/useMultiplayer.ts`**

- Manages Supabase Realtime channel (`game-{roomCode}`)
- Uses **Broadcast** for game data, **Presence** for player tracking
- Room code generation (4-char alphanumeric)
- Role detection: first joiner = host, second = guest
- Host: forwards remote inputs to worker, broadcasts worker state over channel
- Guest: sends local inputs over channel, receives state, interpolates
- Exposes: `{ createRoom, joinRoom, roomCode, isHost, isConnected, opponentConnected, remoteState, sendInputs, disconnect }`

### 3. Create Online Lobby Component
**New file: `src/components/OnlineLobby.tsx`**

- Two options: "Create Room" (shows generated code) and "Join Room" (input field)
- Shows connection status and "Waiting for opponent..." state
- Back button to return to menu

### 4. Modify Game.tsx

- Add `GameMode = "menu" | "solo" | "duel" | "online"` 
- Add "ONLINE" button to menu screen
- In online mode:
  - **Host**: Spawn worker, feed local + remote inputs, render worker output
  - **Guest**: Render received state with lerp interpolation, send inputs via hook
- Show room code + connection status in HUD
- Handle disconnect ("Opponent left" → return to menu)

### 5. State Compression

Only transmit essential data each tick (~20fps broadcast rate):
- Ship positions, rotations, velocities, thrust state, invulnerable flag
- Bullet positions + rotations (max ~20)
- Asteroid positions + velocities + sizes
- Kill/death counts, respawn timers
- Skip: particles, floating texts, stars (regenerate client-side)

Estimated payload: ~500-800 bytes per frame, well within Realtime limits.

### 6. Latency Handling

- Guest interpolates between last two received states (lerp over ~3 frames)
- Local input is rendered immediately on guest (ship rotation/thrust visual) for responsiveness, corrected on next state update
- Worker tick rate (60fps) decoupled from network broadcast rate (20fps)

## Technical Notes

- Worker loaded via `new Worker(new URL('./workers/gameWorker.ts', import.meta.url), { type: 'module' })` (Vite native support)
- No database tables needed -- purely Realtime Broadcast
- No authentication required -- anonymous channel access via anon key
- Particles/explosions generated locally based on state deltas (e.g., ship died → spawn explosion)

