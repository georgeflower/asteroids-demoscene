

# Fix: Space (fire) stops when Arrow keys are pressed

## Problem
Firing is driven by browser `keydown` events (which auto-repeat). When you press an Arrow key while holding Space, the browser stops repeating the Space keydown, so `shootBullet()` stops being called. Gamepad fire works continuously because it's polled every frame in the game loop.

## Solution
Add continuous keyboard fire polling in the solo game loop update, matching how gamepad fire already works. Instead of relying on `keydown` event repeats for shooting, check `keysRef.current[fire_key]` each frame and call `shootBullet()` (which already has its own rate-limiting via `lastShotRef`).

## Changes

**`src/pages/Game.tsx`** — In the solo update function (around line 2502), add a keyboard fire check alongside the existing gamepad fire check:

```typescript
// Current (gamepad only):
if (gp0.fire) shootBullet();
if (gp0.hyperspace) hyperspace();

// New (keyboard + gamepad):
const p1Fire = keysRef.current[b.p1.fire] || gp0.fire;
const p1Hyper = keysRef.current[b.p1.hyperspace] || keysRef.current["h"] || keysRef.current["H"] || gp0.hyperspace;
if (p1Fire) shootBullet();
if (p1Hyper) hyperspace();
```

The `shootBullet` function already has rate-limiting (`fireRate` check), so polling every frame is safe — it won't fire faster than intended. The `handleCanvasKeyDown` fire call can remain for immediate first-shot responsiveness.

