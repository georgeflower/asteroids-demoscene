

## Plan: Asteroid Variety, Edge Homing, Level System, Color Themes, and New Enemies

### 1. Asteroid Speed Variation for Large Asteroids
Currently large asteroids all use `ASTEROID_SPEEDS.large * (0.8-1.2)`. Change to wider variance: `0.3-1.5` multiplier so each large asteroid feels distinct.

### 2. Edge Wrapping with Ship-Homing Nudge
In the `wrapPosition` logic for asteroids: detect when an asteroid crosses a screen edge (position wrapped), then slightly adjust its velocity angle toward the ship's position. Small nudge (~5-10 degrees) so it's subtle but makes gameplay harder over time.

### 3. Level Progression System
- Add `level` to GameState (separate from `wave` — or repurpose `wave` as the level counter, which it already is). Every wave cleared increments the level.
- Scale asteroid speed by `1 + level * 0.05` so things get progressively faster.
- Increase asteroid count per wave more aggressively at higher levels.
- More frequent UFO spawns at higher levels.

### 4. Color Theme Changes Every 5 Levels
Define 5+ color theme palettes (neon green, red/orange, blue/purple, gold/amber, pink/magenta). Every 5 waves, switch the theme which changes:
- Asteroid stroke colors
- Background tint
- Ship glow color
- Canvas border glow color
- Stored as a `colorTheme` object in state, selected by `Math.floor((wave-1) / 5) % themes.length`

### 5. New Enemy: Alien (Brown)
- New interface `Alien` with `type: "brown" | "greenMan" | "boss"`
- **Brown Alien**: Small, fast, appears from wave 3+. Moves in erratic zigzag patterns. No shooting — kamikazes toward the ship. Worth 300 points. Drawn as a brown angular shape.
- Spawns on a timer similar to UFOs, frequency increases with level.

### 6. New Enemy: Green Man with Ray Gun
- Appears from wave 6+. Moves slowly, but fires aimed green "ray" bullets at the ship. Worth 500 points.
- Drawn as a small humanoid figure (stick figure style) in green with a visible "gun" line.
- Ray bullets are green, travel faster than normal UFO bullets.

### 7. Boss Every 5 Levels
- At waves 5, 10, 15, etc., after clearing all asteroids, a boss spawns instead of moving to the next wave.
- **Boss design**: Round body with 4-6 animated tentacles (drawn as wavy lines using sine waves). Large hitbox (~60px radius).
- Boss has HP (scales with level: `3 + level`). Each hit flashes the boss and spawns particles.
- Boss attacks: fires spread shots (3 bullets in a fan) on a timer, tentacles deal contact damage.
- Worth 2000+ points. Drops guaranteed power-up on death.
- Drawn with pulsing glow, tentacles animate each frame using sine offsets.

### 8. Data Model Changes
Add to GameState:
```typescript
interface Alien extends GameObject {
  type: "brown" | "greenMan";
  hp: number;
  moveTimer: number;
}

interface Boss extends GameObject {
  hp: number;
  maxHp: number;
  tentacles: number;
  shootTimer: number;
  hitFlash: number;
  phase: number;
}

// GameState additions:
aliens: Alien[];
boss: Boss | null;
alienSpawnTimer: number;
colorTheme: ColorTheme;
```

### 9. Color Themes
```typescript
const COLOR_THEMES = [
  { name: "Classic", ship: "#00FFFF", asteroids: ["#FFFFFF","#88DDFF","#44AAFF"], bg: "#050510", accent: "#00FF88" },
  { name: "Inferno", ship: "#FF8800", asteroids: ["#FF4444","#FF8844","#FFAA22"], bg: "#0A0505", accent: "#FF2200" },
  { name: "Void",    ship: "#AA44FF", asteroids: ["#CC88FF","#8844CC","#6622AA"], bg: "#050510", accent: "#FF44FF" },
  { name: "Solar",   ship: "#FFDD00", asteroids: ["#FFD700","#FFAA00","#FF8800"], bg: "#0A0800", accent: "#FFFF44" },
  { name: "Toxic",   ship: "#44FF44", asteroids: ["#88FF88","#44CC44","#22AA22"], bg: "#030A03", accent: "#00FF00" },
];
```

### Files Changed
- `src/pages/Game.tsx` — All changes in this single file (new interfaces, enemy logic, boss logic, color themes, drawing routines, updated spawn/collision systems)

