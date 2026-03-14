

# Add 3 New Enemy Types + 3 New Boss Types

## Current State
- **Enemies**: Brown alien (chaser), Green man (shooter) — spawn from wave 3 and 6 respectively
- **Boss**: Single "tentacle boss" (jellyfish-like), spawns every 5 waves
- Game.tsx is ~4300 lines with all logic inline

## New Enemies (3 types)

| Enemy | Spawn Wave | Behavior |
|---|---|---|
| **Red Drone** | Wave 4+ | Orbits at a distance from the player, periodically dashes in kamikaze-style, fast but fragile (1 HP) |
| **Blue Sentinel** | Wave 8+ | Teleports to random positions, fires bursts of 3 shots, then goes invisible briefly (2 HP) |
| **Purple Swarm** | Wave 12+ | Spawns in groups of 3, flocks together (boids-like), overwhelms with numbers (1 HP each) |

## New Bosses (4 total, themed per milestone)

| Wave | Boss | Visual | Behavior |
|---|---|---|---|
| 5 | **Tentacle Boss** (existing) | Jellyfish with tentacles | Sway + 3-spread shots |
| 10 | **Amiga Bouncing Ball** | Red/white checkered sphere, procedurally rendered with lighting/shadow, slow spin | Bounces around the screen, spawns shockwave rings on bounce, fires radial bursts |
| 15 | **Flying Saucer** | Large detailed UFO with rotating lights | Tractor beam pulls player, spawns mini-saucers, sweeping laser |
| 20 | **Borg Cube** | Wireframe rotating cube with green glow | Adapts to player position, fires grid-pattern lasers, regenerates HP slowly |

After wave 20, bosses cycle (wave 25 = tentacle, 30 = ball, etc.)

## Amiga Bouncing Ball — Procedural Rendering

The iconic Amiga checkered ball will be drawn entirely in code on a canvas:
- Sphere rendered with UV-mapped checkerboard pattern (red `#CC0000` / white `#FFFFFF`)
- Rotation applied via angle offset to U coordinate to simulate spin
- Shading: hemisphere lighting — bright on upper-left, dark on lower-right using dot-product with light direction
- Specular highlight near top-left
- Rendered scanline-by-scanline: for each pixel in the bounding circle, compute sphere normal, UV, checker color, then apply lighting

## Implementation Plan

### 1. Extend `Alien` interface
Add `type` field to include `"redDrone" | "purpleSwarm" | "blueSentinel"` alongside existing types. Add optional fields: `dashTimer`, `invisTimer`, `flockId`.

### 2. Add enemy creation functions
`createRedDrone`, `createBlueSentinel`, `createPurpleSwarm` — each with appropriate AI params.

### 3. Extend alien update logic
In the alien update section (~line 1808), add behavior branches for each new type:
- Red Drone: orbit + dash logic
- Blue Sentinel: teleport + burst fire + invisibility toggle
- Purple Swarm: boids flocking toward centroid, chase player as group

### 4. Extend alien drawing
In `drawCommon` (~line 2292), add rendering for each new type with distinct visual designs.

### 5. Extend alien spawn logic
In spawn timer section (~line 1792), add wave-gated spawning for new types.

### 6. Extend `Boss` interface
Add `bossType` field: `"tentacle" | "amigaBall" | "flyingSaucer" | "borgCube"`. Add optional fields for type-specific state: `bounceVelY`, `rotAngle`, `tractorBeamAngle`, `regenTimer`, `subEntities`.

### 7. Update `createBoss`
Select boss type based on `(wave / 5) % 4`: 1=tentacle, 2=amigaBall, 3=flyingSaucer, 4=borgCube. Set type-specific HP, behavior params.

### 8. Update boss AI (~line 1861)
Branch on `bossType` for movement and attack patterns:
- **Amiga Ball**: Bounce physics (velocity + gravity + wall reflection), radial bullet bursts on bounce, shockwave particles
- **Flying Saucer**: Slow lateral sweep, tractor beam (pulls ship vel toward saucer), spawn mini-saucers, sweeping laser line
- **Borg Cube**: Track player, grid-pattern laser bursts, slow HP regen every N ticks

### 9. Update boss drawing (~line 2486)
Branch on `bossType`:
- **Tentacle**: Keep existing code
- **Amiga Ball**: Procedural checkered sphere with rotation, lighting, shadow, specular — rendered to offscreen canvas and cached, redrawn on rotation change
- **Flying Saucer**: Detailed saucer shape with rotating light dots, tractor beam cone
- **Borg Cube**: 3D wireframe cube projection with green glow, rotation on two axes

### 10. Update boss collision radius
Different sizes per boss type in collision checks.

### Files modified
- `src/pages/Game.tsx` — all changes (enemies, bosses, drawing, AI, spawning)

