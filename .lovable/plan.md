

# Performance Optimization Plan

50 FPS on a dedicated GPU points to the canvas 2D rendering pipeline being the bottleneck. After inspecting the draw code, here are the main culprits and fixes:

## Root Causes

1. **85 `shadowBlur` calls per frame** — Canvas shadow rendering is extremely expensive. Each shadow-enabled draw call forces the browser to do a multi-pass Gaussian blur. This is the #1 bottleneck.

2. **Gradient objects created every frame** — `createRadialGradient` and `createLinearGradient` are called inside `draw()`, allocating new gradient objects 60 times/second (vignette, marquee backdrops). These should be cached.

3. **CRT scanline loop every frame** — Drawing individual 1px `fillRect` calls in a loop across the full canvas height (every 4px = ~150 calls) is slow. A pre-rendered scanline pattern image drawn once would be faster.

4. **Double-stroke glow technique** — Ships, asteroids, and bullets are stroked twice (once normal, once with higher shadowBlur + lower alpha) for a glow effect. This doubles the shadow cost.

## Changes (all in `src/pages/Game.tsx`)

### 1. Eliminate or drastically reduce `shadowBlur`
- Remove `shadowBlur` from **all per-object draws** (ships, asteroids, bullets, particles, aliens, UFOs, power-ups, floating text).
- Keep a very subtle `shadowBlur` only on the ship (reduces 85 → ~2 calls).
- Remove double-stroke glow passes entirely — the visual difference is minimal at 60 FPS.

### 2. Cache the vignette gradient and scanline overlay
- Create the vignette `RadialGradient` once (on canvas resize) and store in a ref, reuse each frame.
- Pre-render the CRT scanlines to an offscreen canvas once, then `drawImage` it each frame (1 call vs ~150).
- Same for marquee backdrop gradients — cache them.

### 3. Remove marquee scanline sub-loops
- The now-playing and oneliner marquee areas each draw their own mini scanline overlays (lines 2478-2482, 2546-2550). Remove these — the main CRT overlay already covers the full screen.

### 4. Reduce particle/floating-text shadow
- Particles and floating texts each set `shadowBlur` per item. With 20+ particles on screen, this is costly. Remove shadows from particles entirely.

## Expected Impact
- Removing shadowBlur alone should recover 15-25 FPS on most hardware.
- Caching gradients + scanline overlay saves repeated allocations.
- Target: solid 60 FPS.

