

# Balance Tweaks + New Features for Enemies & Bosses

## Changes (all in `src/pages/Game.tsx` unless noted)

### 1. Amiga Ball — longer bullet range
- **Line 2163**: Change `lifetime: BULLET_LIFETIME * 1.2` → `lifetime: BULLET_LIFETIME * 2.5` so radial burst bullets travel much further

### 2. Flying Saucer — much weaker tractor beam
- **Line 2177**: Reduce pull from `0.06` → `0.015` (4x weaker)

### 3. Borg Cube — spawn mini cubes every 5-8 seconds
- **Boss interface (~line 134)**: Add `miniCubeTimer?: number` and `miniCubes?: Array<{ pos: Vector; vel: Vector; hp: number; rotAngle: number }>`
- **createBoss (~line 876)**: Initialize `miniCubeTimer: 300 + Math.random() * 180` and `miniCubes: []`
- **Boss AI (~line 2265)**: Add mini-cube spawning logic — decrement timer, spawn a small cube with random velocity toward player when timer hits 0, reset to `300 + Math.random() * 180` (~5-8 sec at 60fps). Mini cubes drift toward player slowly, collide with player bullets (1 HP), and collide with ship.
- **Boss drawing (~line 3193)**: Draw mini cubes as small green wireframe cubes (8px)
- **Collision sections**: Add mini-cube vs player-bullet and mini-cube vs ship checks

### 4. Purple Swarm — much slower
- **Line 2050**: Acceleration `0.03` → `0.015`
- **Line 2061**: Max speed `1.5` → `0.8`

### 5. Red Drone — slower, less kamikaze
- **Line 1970**: Orbit speed `0.02` → `0.01`
- **Line 1975**: Dash speed `3.5` → `2.0`
- **Line 1981**: Dash cooldown `250 + random*120` → `400 + random*200`
- **Line 1988-1989**: Orbit tracking `0.02` → `0.01`

### 6. Blue Sentinel — charge visual + sound before teleport
- **Alien interface (~line 103)**: Add `chargeTimer?: number`
- **AI logic (~line 2028)**: Instead of instant teleport when `teleportCooldown <= 0`, set `chargeTimer = 30` (0.5 sec charge). During charge, alien glows brighter but doesn't move. When charge completes, execute the teleport and play a subtle charge/warp sound.
- **Drawing (~line 2821)**: When `chargeTimer > 0`, draw expanding energy rings around the sentinel (pulsing blue circles)
- **`src/utils/soundEffects.ts`**: Add a `warpCharge()` method — short ascending sine tone (~200→800Hz over 0.2s) with low volume

