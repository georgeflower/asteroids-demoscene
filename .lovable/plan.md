

# Nerf Enemies & Bosses — Slow Down and Reduce Difficulty

## Changes (all in `src/pages/Game.tsx`)

### 1. Red Drone — slower orbit, slower dash, longer cooldown
- **Line 770**: Speed `3 + random*2` → `1.5 + random*1`
- **Line 776**: Dash timer `120 + random*60` → `200 + random*100`
- **Line 1970**: Orbit speed `0.04` → `0.02`
- **Line 1975**: Dash speed `6` → `3.5`
- **Line 1981**: Dash cooldown `150 + random*80` → `250 + random*120`

### 2. Blue Sentinel — slower burst, longer teleport cooldown
- **Line 2012**: Burst fire interval `8` → `15`
- **Line 2016**: Bullet speed `5` → `3.5`
- **Line 2021**: Post-burst cooldown `80 + random*40` → `120 + random*60`
- **Line 2033**: Teleport cooldown `120 + random*80` → `200 + random*120`

### 3. Purple Swarm — slower max speed, weaker chase
- **Line 2050**: Acceleration `0.06` → `0.03`
- **Line 2061**: Max speed `2.5` → `1.5`
- **Line 791**: Initial speed multiplier from `1.5 + random` → `0.8 + random*0.5`

### 4. Amiga Ball — slower bounce, more random heights
- **Line 2118**: Gravity `0.05` → `0.025` (slower fall)
- **Line 2120**: Horizontal speed `2` → `1 + random*1.5`
- **Line 2132**: Bounce restitution: change `-(abs * 0.9 + 1.5)` → `-(abs * 0.5 + 0.5 + random*2)` — randomized bounce height so it doesn't always go to top
- **Line 2156**: Shoot timer min `60` → `90`, base `120` → `180`
- **Line 2162**: Bullet speed `3` → `2`
- **Line 855**: Initial bounceVelX `2 + random*2` → `1 + random*1`

### 5. Flying Saucer — weaker tractor beam, slower shooting
- **Line 2177**: Pull strength `0.15` → `0.06`
- **Line 2212**: Shoot timer min `50` → `80`, base `100` → `160`
- **Line 2217**: Laser bullet speed `5` → `3.5`

### 6. Borg Cube — slower regen, slower shooting
- **Line 2234**: Regen interval `180` → `300`
- **Line 2243**: Grid laser timer min `80` → `120`, base `160` → `240`
- **Line 2249**: Grid bullet speed `3.5` → `2.5`
- **Line 2258**: Aimed shot timer min `30` → `60`, base `70` → `120`
- **Line 2262**: Aimed bullet speed `4` → `2.8`

