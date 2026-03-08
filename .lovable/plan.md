

## Plan: Floating Power-Up Text, Improved UFO Spawning, and Modern Retro Graphics

### 1. Floating Text System
Add a `FloatingText` interface and array to GameState for on-canvas text notifications that float upward and fade out:
- When a power-up is collected, spawn floating text at that position (e.g., "SHIELD!", "RAPID FIRE!", "2x SCORE!", "+1 LIFE")
- When a UFO is destroyed, show the points earned
- Each text has position, opacity, color, lifetime, and drifts upward while fading

### 2. Improved UFO/Flying Saucer System
Currently UFOs only spawn every 3rd wave. Change to:
- UFOs spawn randomly during gameplay on a timer (every ~15-25 seconds)
- They enter from one edge, fly across with sine-wave movement, and exit the other side
- Small UFOs (harder, aimed shots) appear at higher waves; large UFOs (random shots) appear early
- UFO bullets are visually distinct (different color)
- Destroying a UFO awards 200 (large) or 1000 (small) points — already implemented
- Remove UFOs that exit the screen (currently they wrap — change to despawn)

### 3. Modern Retro Graphics Improvements
Upgrade the visual style while keeping the retro feel:
- **Starfield background**: Parallax scrolling star layers instead of flat black
- **Neon glow effects**: Stronger bloom/glow on ship, bullets, and asteroids using multiple shadow layers
- **Ship exhaust particles**: Small particle trail when thrusting
- **Explosion particles**: Burst of particles when asteroids/UFOs are destroyed instead of just disappearing
- **Asteroid color tinting**: Subtle color variation per asteroid size (white/cyan/blue)
- **Score pop-ups**: Points float up from destroyed objects
- **Scanline overlay**: Subtle CRT scanline effect on canvas
- **Active power-up HUD indicators**: Show active power-ups with timers as bars on the canvas (top area)

### 4. Data Model Changes
Add to GameState:
```
floatingTexts: { pos: Vector, text: string, color: string, opacity: number, lifetime: number }[]
particles: { pos: Vector, vel: Vector, lifetime: number, color: string, size: number }[]
stars: { x: number, y: number, brightness: number, layer: number }[]
ufoSpawnTimer: number
```

### 5. Files Changed
- `src/pages/Game.tsx` — All changes in this single file

### Technical Details
- Stars generated once at game init (~100 points across 3 parallax layers)
- Particles spawned on explosions (8-15 per event), updated and drawn each frame, removed when lifetime expires
- Floating text rises at 0.5px/frame, fades over 90 frames
- UFO spawn timer decrements each frame; when 0, spawns a UFO and resets to 900-1500 frames (~15-25s at 60fps)
- UFOs that go off-screen (x < -30 or x > CANVAS_WIDTH+30) are removed instead of wrapping
- CRT scanlines drawn as semi-transparent horizontal lines every 3px
- Power-up HUD bars drawn directly on canvas below the score area

