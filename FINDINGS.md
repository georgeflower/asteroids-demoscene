# Codebase Deep-Dive Analysis — Findings Report

> **Scope**: Full 3-pass analysis of every file in the repository.  
> **Date**: 2026-04-07  
> **Analyst**: Copilot Task Agent  

---

## Table of Contents

1. [Pass 1 — Discovery & Inventory](#pass-1--discovery--inventory)
2. [Pass 2 — Deep Analysis](#pass-2--deep-analysis)
3. [Pass 3 — Verification & Prioritisation](#pass-3--verification--prioritisation)
4. [Quick Wins](#quick-wins)
5. [Architectural Improvements](#architectural-improvements)

---

## Pass 1 — Discovery & Inventory

### File Inventory

| File | Role |
|---|---|
| `src/pages/Game.tsx` | God-component: all game modes, rendering pipeline, input, UI, networking (~5,700 lines) |
| `src/workers/coopWorker.ts` | Physics Web Worker for cooperative / online-coop modes |
| `src/workers/gameWorker.ts` | Physics Web Worker for online duel mode |
| `src/hooks/useMultiplayer.ts` | Supabase Realtime multiplayer hook (rooms, presence, broadcast) |
| `src/utils/soundEffects.ts` | Web Audio API synthesised sound effects (singleton) |
| `src/constants/debug.ts` | Debug flag + log-entry types |
| `supabase/functions/submit/index.ts` | Deno Edge Function: session, heartbeat, score-submit, admin (~1,010 lines) |
| `src/components/` | UI: `OnlineLobby`, `LobbyChat`, `PlayerList`, `CRTBootOverlay`, `ControlSettings`, `AdminMonitor` |
| `src/hooks/useControlSettings.ts`, `useVersionCheck.ts` | Control-bindings persistence, SemVer update checker |
| `src/types/multiplayer.ts` | Shared TypeScript types for network state |
| `public/images/` | GIF assets (5 files used in the oneliner marquee) |
| `supabase/migrations/` | Postgres migration SQL (RLS policies, tables, RPCs) |
| `CHANGELOG.md`, `SECURITY.md`, `README.md`, `DEPLOYMENT.md` | Documentation |

### Architecture

- **Framework**: React 18 SPA, TypeScript, Vite/SWC, Tailwind CSS, Shadcn/Radix UI  
- **Rendering**: HTML5 Canvas 2D API at 800×600 fixed resolution  
- **Game Loop**: `requestAnimationFrame` + fixed-timestep accumulator at 60 Hz  
- **Physics**: Inline in the React component for solo/duel; delegated to Web Workers for all co-op/online modes  
- **Multiplayer**: Supabase Realtime broadcast channels; host-runs-physics model; guest uses client-side prediction + reconciliation  
- **Backend**: Supabase (Postgres + RLS), Deno Edge Functions  
- **Audio**: Web Audio API, synthesised via `SoundEffects` class singleton  
- **Input**: Keyboard (`keysRef`), gamepad (`navigator.getGamepads()` polled per frame), touch (virtual buttons), configurable key bindings  

### Game Modes

`"menu"` | `"solo"` | `"duel"` | `"online_lobby"` | `"online"` | `"coop"` | `"online_coop"`

### Notable Dependencies

| Package | Version | Note |
|---|---|---|
| `@supabase/supabase-js` | `^2.98.0` | Realtime, database, edge functions |
| `@tanstack/react-query` | `^5.83.0` | **Declared but never used** — candidate for removal |
| `terser` | `^5.46.1` | Listed under `dependencies` not `devDependencies` — misplaced |
| Radix UI | 20+ packages | Full suite present; most used only for menu/HUD dialogs |

---

## Pass 2 — Deep Analysis

### GPU / Canvas Performance Issues

#### P2-GPU-1 — Amiga Ball boss: ~1,100 `fillRect` calls per frame ⚠️ CRITICAL
**File**: `src/pages/Game.tsx` lines ~3,316–3,367 (coop) and ~4,304–4,367 (solo)

The Amiga Ball boss is drawn pixel-by-pixel using a nested `for` loop over the 100px-diameter sphere at step=3. Each pixel requires: `Math.sqrt`, `Math.atan2`, `Math.asin`, modulo operations, `Math.pow`, per-channel clamping — and a `ctx.fillStyle` write + `ctx.fillRect` call. This runs **every frame** the boss is active and appears **twice** (once in the coop path, once in solo). On mid-range hardware this will cause significant frame-time spikes.

**Fix**: Pre-render the sphere to an `OffscreenCanvas` / `ImageData`; re-rasterise only when `boss.rotAngle` changes by a perceptible amount (e.g. every 2°), then composite with a single `ctx.drawImage`.

---

#### P2-GPU-2 — `canvas.getContext("2d")` called every frame
**File**: `src/pages/Game.tsx` lines ~3,765–3,768

`getContext` is called at the top of every `draw()` invocation. The 2D context handle is stable and should be cached in a `useRef` on canvas mount.

---

#### P2-GPU-3 — 120 star arcs redrawn every frame
**File**: `src/pages/Game.tsx` lines ~3,491–3,500

Star positions are static; only parallax offset and twinkle amplitude vary. Non-parallax star layers could be pre-rendered to an offscreen canvas and composited with a single `drawImage`.

---

#### P2-GPU-4 — Marquee text width measured every frame
**File**: `src/pages/Game.tsx` lines ~4,751–4,773

The oneliner marquee calls `ctx.measureText(...)` inside a while-loop on every frame. `TextMetrics` computation is expensive. The total width should be cached and only recomputed when `olText` content changes.

---

#### P2-GPU-5 — `Date.now()` inside `draw()` instead of RAF timestamp
**File**: `src/pages/Game.tsx` lines ~3,448, ~3,490, ~3,887

`draw()` is called from `gameLoop(currentTime)` which already receives the high-precision `DOMHighResTimeStamp` from `requestAnimationFrame`. Several places inside `draw()` call `Date.now()` for animation timing (ship blink, star twinkle, UFO pulse). The RAF timestamp should be forwarded to `draw` instead.

---

### CPU Performance Issues

#### P2-CPU-1 — O(n²) purple swarm flocking
**File**: `src/pages/Game.tsx` lines ~2,793–2,816

For every `purpleSwarm` alien in the update loop, `state.aliens.filter(...)` is called to find flock-mates. This is O(n²) per tick. Flock groups should be pre-computed once per tick (e.g. a `Map<flockId, Alien[]>`).

---

#### P2-CPU-2 — `Math.sqrt` in `checkCollision`
**File**: `src/pages/Game.tsx` lines ~2,015–2,019

`checkCollision` uses `Math.sqrt(dx*dx + dy*dy) < r1+r2`. The square root is unnecessary — compare squared distances instead: `dx*dx + dy*dy < (r1+r2)*(r1+r2)`. This function is called hundreds of times per frame across all collision pairs.

---

#### P2-CPU-3 — Multiple sequential bullet-array passes
**File**: `src/pages/Game.tsx` lines ~3,201–3,365

The bullet array is iterated 5–6 times per tick (once per entity type: asteroids, UFOs, aliens, boss body, mini-saucers, mini-cubes). A single pass with entity-type dispatch would halve the iteration cost.

---

#### P2-CPU-4 — Proof-of-Work solved on the main thread ⚠️ HIGH
**File**: `src/pages/Game.tsx` lines ~655–682

`solvePoW` runs on the main thread at game start, yielding every 1,000 iterations via `setTimeout(r, 0)`. At difficulty 18 bits (~262,144 expected iterations), each burst of 1,000 SHA-256 hashes competes with the game loop. This should be offloaded to a dedicated Web Worker.

---

#### P2-CPU-5 — UFO beep fires multiple times per trigger window
**File**: `src/pages/Game.tsx` lines ~2,620–2,622

```js
if (Math.floor(Date.now() / 1000) % 2 === 0 && Math.floor(Date.now() / 100) % 10 === 0) {
  soundEffects.ufoBeep();
}
```

The 100ms trigger window spans ~6 game frames at 60 Hz, causing `ufoBeep()` to fire up to **6 times per UFO per trigger**. Each call creates 3 `AudioNode` objects that rely on GC for cleanup. A per-UFO `beepTimer` counter (already used in `coopWorker.ts`'s `UFO` interface) should replace this.

---

#### P2-CPU-6 — `setCoopEliminated` called unconditionally at 60 Hz ⚠️ HIGH
**File**: `src/pages/Game.tsx` line ~3,888

`applyCoopNetState` calls `setCoopEliminated([...cs.eliminated])` on every state update (60 Hz local, 20 Hz online) regardless of whether the eliminated array has changed. This causes unnecessary React re-renders. A dirty-check guard is needed.

---

### Logic Errors

#### P2-LOGIC-1 — Boss type label uses floating-point modulo without `Math.floor`
**File**: `src/pages/Game.tsx` lines ~1,940–1,942

`(state.wave / 5 - 1) % 4` is used to determine the boss label string in `nextWave`. This matches the expression in `createBoss` but is not floor-rounded, creating a risk of floating-point drift. Both `nextWave` and `createBoss` also define the boss type string array as an independent local — they should share a single constant.

---

#### P2-LOGIC-2 — `redDrone` alien: spawning removed but code remains
**File**: `src/pages/Game.tsx` lines ~2,656; ~2,702–2,733; ~3,611

`redDrone` was removed from spawn logic but its update code, draw placeholder comment, `Alien` type union membership, and `createAlien` handler all remain. The type union in `coopWorker.ts` (line 24) does **not** include `"redDrone"`, creating a divergence between solo and coop alien types. This dead code should be fully removed or the feature re-enabled consistently.

---

#### P2-LOGIC-3 — Asteroid spawn loop has no iteration cap
**File**: `src/pages/Game.tsx` lines ~1,203–1,214 and ~1,953

```js
for (let i = 0; i < 4; i++) {
  // ...
  if (dist > 100) { asteroids.push(...); }
  else { i--; }  // retry indefinitely
}
```

The retry loop has no maximum iteration guard. With a very small canvas area or large exclusion radius, this could loop indefinitely. A max-retry cap (e.g., 100 attempts) should be added.

---

#### P2-LOGIC-4 — Solo fire rate (wall-clock) vs. worker fire rate (tick-based) inconsistency
**File**: `src/pages/Game.tsx` lines ~2,063–2,069 vs. `src/workers/gameWorker.ts` line ~171

Solo mode rate-limits bullets with `Date.now()` wall-clock (250ms / 100ms rapid). The duel worker uses `tick - lastShotTime[p] >= 15` (tick-based ≈ 250ms at 60 Hz). Under load (frame rate < 60 Hz), the tick-based approach naturally reduces bullet rate while wall-clock does not, creating a cross-mode inconsistency.

---

#### P2-LOGIC-5 — `loseLife` `useCallback` missing `stopHeartbeatInterval` in deps
**File**: `src/pages/Game.tsx` line ~2,021

`stopHeartbeatInterval` is called inside `loseLife` on game over but is not listed in the `useCallback` dependency array. ESLint exhaustive-deps would flag this.

---

#### P2-LOGIC-6 — Shield pickup clears spawn invulnerability timer
**File**: `src/pages/Game.tsx` lines ~3,147–3,149

```js
case "shield":
  state.powerUpActive.shield = 300;
  state.ship.invulnerable = true;
  state.ship.invulnerableTime = 0; // ← clears spawn timer
```

Setting `invulnerableTime = 0` discards any remaining spawn invulnerability window. This is acknowledged in a comment but the interaction is fragile and counter-intuitive.

---

#### P2-LOGIC-7 — `GameState.paused` field is dead code
**File**: `src/pages/Game.tsx` lines ~204, ~1,217, ~734

`GameState.paused` is initialised to `false` and never set to `true`. Pause state is managed entirely via `isPausedRef.current`. The `sendHeartbeat` function checks `state.paused` (which is always `false`), making the heartbeat suppression during pause non-functional.

---

#### P2-LOGIC-8 — UFO `direction` field is dead code
**File**: `src/pages/Game.tsx` lines ~1,010–1,011

`createUFO` sets `direction` but the UFO update loop reads `ufo.vel.x` exclusively. `direction` is never read after creation.

---

### Bad Practices & Code Quality

#### P2-STYLE-1 — God component (`Game.tsx` ≈ 5,700 lines)
All game modes, rendering pipeline, UI overlays, networking glue, anti-cheat, audio, input handling, and state machines live in one React function component. This makes the file impossible to unit-test or safely refactor.

---

#### P2-STYLE-2 — Pervasive magic numbers
Dozens of unexplained literals throughout the codebase. Key examples:

| Value | Meaning | Occurrences |
|---|---|---|
| `120` | Spawn invulnerability duration (frames) | 8+ across Game.tsx + workers |
| `300` / `600` / `900` | Shield / rapidFire / multiplier durations | repeated |
| `0.15` / `0.2` | Power-up drop rates (solo vs. coop — different, unexplained) | 2 |
| `60` | Bullet lifetime, also beep timer, also respawn buffer | many |
| `0.05` | Default turn speed | 4+ |

---

#### P2-STYLE-3 — `AudioContext` constructed at module import time ⚠️ HIGH
**File**: `src/utils/soundEffects.ts` lines ~13–19, ~188

```js
export const soundEffects = new SoundEffects(); // runs at module evaluation time
```

`new AudioContext()` is called at import time. On unsupported platforms this throws and crashes the entire app. On modern Chrome it creates a `suspended` context before user gesture. The singleton should be lazily initialised on first use.

---

#### P2-STYLE-4 — `thrustOscillator` typed as wrong node type
**File**: `src/utils/soundEffects.ts` line ~97

`AudioBufferSourceNode` is cast to `OscillatorNode` via `as unknown as OscillatorNode`. The field should be typed as `AudioScheduledSourceNode | null`.

---

#### P2-STYLE-5 — `useMultiplayer` returns new object literal each render
**File**: `src/hooks/useMultiplayer.ts` lines ~455–494

The hook returns a plain object literal, not memoised with `useMemo`. Every parent render creates a new object, causing all downstream `useEffect`/`useCallback` hooks listing `multiplayer` as a dependency to re-run.

---

#### P2-STYLE-6 — `HIGH_SCORES_ENABLED = false` but anti-cheat infrastructure still active ⚠️ HIGH
**File**: `src/pages/Game.tsx` line ~303

Score submission is disabled globally, yet `startGameSession()`, heartbeat POSTs (every 30s), PoW solving, and HMAC computation all still execute. This wastes network traffic, CPU, and main-thread time for a disabled feature.

---

#### P2-STYLE-7 — `@tanstack/react-query` declared but unused
**File**: `package.json` line ~53

No `useQuery`, `useMutation`, or `QueryClientProvider` usage found anywhere in the codebase.

---

#### P2-STYLE-8 — Boss draw code fully duplicated (solo and coop paths)
**File**: `src/pages/Game.tsx` lines ~3,899–4,121 and ~4,262–4,610

All four boss types' rendering code (tentacle, amigaBall, flyingSaucer, borgCube) is copy-pasted twice. A shared `drawBoss(ctx, boss, theme)` helper (like the existing `drawShip`/`drawBullets`) would eliminate the duplication.

---

#### P2-STYLE-9 — Boss HP bar draw code also duplicated
**File**: `src/pages/Game.tsx` lines ~4,089–4,121 and ~4,578–4,610

The boss HP bar rendering appears twice with a subtle 18px vertical position difference (`CANVAS_HEIGHT - 48` vs `CANVAS_HEIGHT - 30`) for unknown reasons.

---

#### P2-STYLE-10 — `loadHallOfFame` fetches 2,000 rows client-side to produce 3 results
**File**: `src/pages/Game.tsx` lines ~604–636

Two queries each fetching 1,000 rows are merged, sorted, and deduplicated in JavaScript to output a top-3 list. A Postgres RPC/view should handle the deduplication and ranking server-side.

---

### Security Issues

#### P2-SEC-1 — CORS `*` conflicts with `validateOrigin` check
**File**: `supabase/functions/submit/index.ts` lines ~3–7

`corsHeaders` sends `Access-Control-Allow-Origin: *` unconditionally (including on the OPTIONS preflight), while `validateOrigin()` returns 403 for disallowed origins on actual requests. The two mechanisms are in conflict: any origin can complete the CORS handshake but is then rejected. The `Access-Control-Allow-Origin` header should be set conditionally to the matched allowed origin.

---

#### P2-SEC-2 — Admin key compared with timing-unsafe `!==`
**File**: `supabase/functions/submit/index.ts` lines ~907–910

The admin routes compare `adminKey !== expectedKey` using a standard string comparison. The existing `timingSafeEqual` helper in the same file should be used instead.

---

## Pass 3 — Verification & Prioritisation

### Summary Table

| ID | Severity | File | Lines | Issue |
|---|---|---|---|---|
| P2-GPU-1 | 🔴 CRITICAL | `Game.tsx` | 3,316–3,367; 4,304–4,367 | Amiga Ball: ~1,100 per-pixel `fillRect` calls per frame |
| P2-STYLE-3 | 🔴 CRITICAL | `soundEffects.ts` | 13–19, 188 | `AudioContext` constructed at module import time |
| P2-CPU-4 | 🟠 HIGH | `Game.tsx` | 655–682 | PoW solved on main game thread |
| P2-CPU-6 | 🟠 HIGH | `Game.tsx` | ~3,888 | `setCoopEliminated` called unconditionally at 60 Hz |
| P2-GPU-2 | 🟠 HIGH | `Game.tsx` | 3,765–3,768 | `getContext("2d")` called every frame |
| P2-STYLE-1 | 🟠 HIGH | `Game.tsx` | 1–5,700 | God component — entire game in one file |
| P2-STYLE-6 | 🟠 HIGH | `Game.tsx` | ~303 | `HIGH_SCORES_ENABLED=false` but anti-cheat infrastructure still active |
| P2-LOGIC-2 | 🟠 HIGH | `Game.tsx` | 2,656; 2,702–2,733 | `redDrone`: dead code across Game.tsx and coopWorker.ts |
| P2-SEC-1 | 🟠 HIGH | `submit/index.ts` | 3–7 | CORS `*` conflicts with `validateOrigin` check |
| P2-CPU-1 | 🟡 MEDIUM | `Game.tsx` | 2,793–2,816 | O(n²) purple swarm flocking |
| P2-CPU-2 | 🟡 MEDIUM | `Game.tsx` | 2,015–2,019 | `Math.sqrt` in `checkCollision` (called 100s of times/frame) |
| P2-CPU-3 | 🟡 MEDIUM | `Game.tsx` | 3,201–3,365 | Multiple sequential bullet-array passes (5–6 per tick) |
| P2-CPU-5 | 🟡 MEDIUM | `Game.tsx` | 2,620–2,622 | UFO beep fires up to 6× per trigger window |
| P2-GPU-3 | 🟡 MEDIUM | `Game.tsx` | 3,491–3,500 | 120 star arcs redrawn every frame |
| P2-GPU-4 | 🟡 MEDIUM | `Game.tsx` | 4,751–4,773 | Marquee text width measured every frame |
| P2-GPU-5 | 🟡 MEDIUM | `Game.tsx` | 3,448; 3,490; 3,887 | `Date.now()` inside `draw()` instead of RAF timestamp |
| P2-STYLE-8 | 🟡 MEDIUM | `Game.tsx` | 3,899–4,121; 4,262–4,610 | Boss draw code fully duplicated (4 boss types × 2) |
| P2-STYLE-9 | 🟡 MEDIUM | `Game.tsx` | 4,089–4,121; 4,578–4,610 | Boss HP bar draw code duplicated with unexplained offset |
| P2-STYLE-10 | 🟡 MEDIUM | `Game.tsx` | 604–636 | `loadHallOfFame` fetches 2,000 rows for 3 results |
| P2-LOGIC-1 | 🟡 MEDIUM | `Game.tsx` | 1,940–1,942 | Boss type label uses floating-point modulo without `Math.floor` |
| P2-LOGIC-5 | 🟡 MEDIUM | `Game.tsx` | ~2,021 | `loseLife` `useCallback` missing dep (`stopHeartbeatInterval`) |
| P2-LOGIC-7 | 🟡 MEDIUM | `Game.tsx` | 204; 1,217; 734 | `GameState.paused` field always `false`, heartbeat suppression broken |
| P2-STYLE-4 | 🟡 MEDIUM | `soundEffects.ts` | ~97 | Wrong type cast for `thrustOscillator` |
| P2-STYLE-5 | 🟡 MEDIUM | `useMultiplayer.ts` | 455–494 | `useMultiplayer` returns new object literal every render |
| P2-SEC-2 | 🟡 MEDIUM | `submit/index.ts` | 907–910 | Admin key compared with timing-unsafe `!==` |
| P2-LOGIC-3 | 🟢 LOW | `Game.tsx` | 1,203–1,214; 1,953 | Asteroid spawn retry loop has no iteration cap |
| P2-LOGIC-4 | 🟢 LOW | `Game.tsx` | 2,063–2,069 | Solo fire rate (wall-clock) vs. worker fire rate (tick-based) |
| P2-LOGIC-6 | 🟢 LOW | `Game.tsx` | 3,147–3,149 | Shield pickup clears spawn invulnerability timer |
| P2-LOGIC-8 | 🟢 LOW | `Game.tsx` | 1,010–1,011 | `UFO.direction` field is dead code |
| P2-STYLE-2 | 🟢 LOW | `Game.tsx` | Various | Pervasive magic numbers |
| P2-STYLE-7 | 🟢 LOW | `package.json` | ~53 | `@tanstack/react-query` declared but unused |

---

## Quick Wins

These are small changes with high impact that can be made independently:

1. **Cache `canvas.getContext("2d")` in a ref** — 2 lines, eliminates a call-per-frame.
2. **`checkCollision`: remove `Math.sqrt`** — 1 line, meaningfully cheaper over hundreds of calls/frame.
3. **Guard `setCoopEliminated`** with a dirty-check before calling `setState` — prevents 60 Hz React re-renders.
4. **Remove `redDrone` dead code** — simplifies the alien type union, update loop, and draw path across two files.
5. **Remove `@tanstack/react-query` from `package.json`** — reduces bundle and install time.
6. **Use `timingSafeEqual` for admin key comparison** — 1 line change.
7. **Guard `startGameSession`/`startHeartbeatInterval` behind `HIGH_SCORES_ENABLED`** — stops unnecessary network traffic.
8. **Fix UFO beep**: replace the `Date.now()` modulo with a per-UFO `beepTimer` decrement (the `UFO` interface in `coopWorker.ts` already has `beepTimer: number` — add it to the solo mode `UFO` interface and use it).
9. **Remove `UFO.direction`** dead field from `createUFO` and the `UFO` interface.
10. **Remove `GameState.paused`** dead field (or wire it to `isPausedRef.current` so heartbeat suppression actually works).

---

## Architectural Improvements

1. **Split `Game.tsx` into domains**: `useSoloGame`, `useCoopGame`, `useDuelGame`, `useDraw` (rendering), `useInput`, `useAnticheat` — each ≈ 200–500 lines and independently testable.
2. **Offload PoW to a dedicated Web Worker** — keeps the main thread clear during game start.
3. **Pre-render Amiga Ball boss to `OffscreenCanvas`** — the sphere is fully deterministic given `rotAngle` and `hitFlash`; rasterise once per few degrees of rotation.
4. **`loadHallOfFame` → Postgres RPC** — server-side deduplication and ranking; fetch 3 rows instead of 2,000.
5. **Lazy-init `AudioContext`** on first user interaction — robustness across all browser targets.
6. **Unified collision dispatch loop** — one bullet-array pass with entity-type branching instead of 5–6 sequential `filter` passes.
7. **Memoize `useMultiplayer` return value** with `useMemo` — prevents downstream effect/callback churn on every render.
8. **Extract `drawBoss(ctx, boss)` shared helper** — eliminates full duplication of all four boss type renderers.
9. **Move boss type constants to a shared file** — prevents `nextWave` / `createBoss` divergence.
10. **Fix CORS policy** in the Edge Function — set `Access-Control-Allow-Origin` conditionally to the matched allowed origin rather than `*`.
