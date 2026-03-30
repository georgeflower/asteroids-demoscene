

# Plan: Fix Co-op Online Restart and Late-Joiner Issues

## Problem Analysis

**Issue 1 — Restart doesn't work (blinking ships, no asteroids):**
The host's worker `onmessage` handler is attached via a `useEffect` that depends on `[gameMode, multiplayer.isHost, ...]`. On restart, these values haven't changed (still `"online_coop"` and `true`), so the effect never re-runs. The new worker created by `initCoop` has no `onmessage` handler — its output is silently discarded. Ships appear but state is never applied or broadcast.

**Issue 2 — Late joiners stuck in lobby:**
When a guest joins mid-game, the spectator effect (line 5096) sets `isSpectating = true` but the guest stays in `gameMode === "online_lobby"`, showing only the lobby UI. They never call `initOnlineCoop` to enter the game view. The `players_added` event only fires when the game ends, not on join.

## Changes

### 1. Fix restart worker handler re-attachment (`src/pages/Game.tsx`)

Add a `coopGeneration` counter ref that increments every time `initCoop` is called. Include it in the worker `onmessage` effect's dependency array so it re-runs on restart, attaching the handler to the new worker.

- Add `const coopGenerationRef = useRef(0)` and a state mirror `const [coopGeneration, setCoopGeneration] = useState(0)`
- In `initCoop`: increment both ref and state (`setCoopGeneration(g => g + 1)`)
- Add `coopGeneration` to the dependency array of the host coop worker effect (line 5163)
- Also add `coopGeneration` to the local coop worker effect dependency (line 5167)

### 2. Host: re-set `gameInProgress` on restart (`src/pages/Game.tsx`)

In the RESTART button handler (line 6466), call `multiplayer.setGameInProgress(true)` alongside `sendGameRestart()` to ensure presence reflects the active game for any new joiners.

### 3. Fix late-joiner spectator transition (`src/pages/Game.tsx`)

Update the spectator detection effect (line 5096) so that when a guest in the lobby detects `gameInProgress`, it also calls `initOnlineCoop(false, ...)` to transition from the lobby into the game view as a spectator. The guest will receive `coop_state` broadcasts and render the game. They'll see the "SPECTATING" overlay. When game ends and `players_added` fires, they transition into active players.

Changes:
- In the `spectatorInitedRef` effect, after setting `isSpectating = true`, call `initOnlineCoop(false, multiplayer.guestCount + 1)` to enter the game view
- The guest will start receiving and rendering `coop_state` from the host immediately

### 4. Ensure late joiners see READY on restart (`src/pages/Game.tsx`)

The `onGameRestartRef` callback (line 5072) only fires when `gameModeRef.current === "online_coop"`. After fix #3, late joiners who were spectating will be in `online_coop` mode, so they'll correctly receive the restart event and see the READY button.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Game.tsx` | Add coopGeneration counter for worker effect re-trigger; call `setGameInProgress(true)` on restart; transition late joiners from lobby to game view as spectators |

