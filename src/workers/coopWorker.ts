// Co-op physics worker – supports up to 8 players cooperating against waves of enemies.
// Bosses every 5 waves, power-ups, hyperspace, and permanent death (no respawn when lives run out).
// No imports – all types and logic are inline for worker isolation.

interface Vector { x: number; y: number; }

interface Ship {
  pos: Vector; vel: Vector; rotation: number;
  rotationSpeed: number; thrust: number; isThrusting: boolean;
  invulnerable: boolean; invulnerableTime: number;
  hyperspaceCooldown: number;
}

interface Asteroid {
  id: number; pos: Vector; vel: Vector; rotation: number;
  size: "large" | "medium" | "small"; points: Vector[]; rotationSpeed: number;
}

interface Bullet {
  pos: Vector; vel: Vector; rotation: number; lifetime: number; owner: number; isBoss?: boolean;
}

interface Alien {
  pos: Vector; vel: Vector; type: "brown" | "greenMan";
  hp: number; moveTimer: number; shootTimer: number; zigzagPhase: number;
}

interface PowerUp {
  pos: Vector; vel: Vector; rotation: number;
  type: "shield" | "rapidFire" | "extraLife" | "multiplier";
  lifetime: number;
}

interface PowerUpActive {
  shield: number; rapidFire: number; multiplier: number;
}

interface MiniSaucer {
  pos: Vector; vel: Vector; hp: number; shootTimer: number;
}

interface MiniCube {
  pos: Vector; vel: Vector; hp: number; rotAngle: number;
}

interface Boss {
  pos: Vector; vel: Vector; rotation: number;
  hp: number; maxHp: number;
  phase: number; hitFlash: number;
  entered: boolean; targetY: number;
  bossType: "tentacle" | "amigaBall" | "flyingSaucer" | "borgCube";
  tentacles: number; shootTimer: number;
  // amigaBall
  bounceVelX?: number; bounceVelY?: number; rotAngle?: number; lastBounceFrame?: number;
  // flyingSaucer
  tractorBeamActive?: boolean; sweepAngle?: number; miniSaucerTimer?: number; miniSaucers?: MiniSaucer[];
  // borgCube
  cubeRotX?: number; cubeRotY?: number; regenTimer?: number; gridLaserTimer?: number;
  adaptPhase?: number; miniCubeTimer?: number; miniCubes?: MiniCube[];
}

interface InputState { left: boolean; right: boolean; up: boolean; fire: boolean; hyperspace?: boolean; }

interface GameEvent {
  type: "explosion" | "kill" | "die_env" | "score_pop" | "boss_spawn" | "powerup";
  x: number; y: number; color: string; count: number;
  player?: number; killer?: number; points?: number; label?: string;
}

const W = 800, H = 600, SHIP_SIZE = 10, BULLET_SPEED = 7, BULLET_LIFETIME = 60;
const ASTEROID_SPEEDS: Record<string, number> = { large: 0.5, medium: 0.8, small: 1.2 };
const FIXED_TIMESTEP = 1000 / 60;
const INITIAL_LIVES = 3;
const MAX_PLAYERS = 8;
const HYPERSPACE_COOLDOWN = 600;

const SCORE_LARGE = 20, SCORE_MEDIUM = 50, SCORE_SMALL = 100, SCORE_ALIEN = 200, SCORE_BOSS = 1000;

let workerTurnSpeed = 0.05;
let playerCount = 2;
let asteroidIdCounter = 0;

let ships: Ship[] = [];
let bullets: Bullet[][] = [];
let asteroids: Asteroid[] = [];
let aliens: Alien[] = [];
let powerUps: PowerUp[] = [];
let boss: Boss | null = null;

let score = 0;
let lives: number[] = [];
let eliminated: boolean[] = [];
let powerUpActive: PowerUpActive[] = [];
let wave = 1;
let respawnTimer: number[] = [];
let alienSpawnTimer = 800;
let asteroidsThisWave = 0;
let asteroidsKilledThisWave = 0;
let waveComplete = false;
let waveCompleteTimer = 0;
let bossDefeated = false;
let gameOver = false;
let tick = 0;
let lastShotTime: number[] = [];
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let workerLastTime = 0;
let workerAccumulator = 0;
let pendingEvents: GameEvent[] = [];
let inputs: InputState[] = [];
let hyperspacePressed: boolean[] = []; // track edge-detect for hyperspace

function createShip(x: number, y: number, idx: number): Ship {
  const rotations = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];
  return {
    pos: { x, y }, vel: { x: 0, y: 0 },
    rotation: rotations[idx % rotations.length],
    rotationSpeed: workerTurnSpeed, thrust: 0.08, isThrusting: false,
    invulnerable: true, invulnerableTime: 120, hyperspaceCooldown: 0,
  };
}

function getStartPos(idx: number, count: number): Vector {
  // Spread ships evenly across the screen
  const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
  const rx = (W / 2 - 100) * Math.cos(angle);
  const ry = (H / 2 - 80) * Math.sin(angle);
  return { x: W / 2 + rx, y: H / 2 + ry };
}

function createAsteroid(x: number, y: number, size: "large" | "medium" | "small"): Asteroid {
  const numPoints = 8 + Math.floor(Math.random() * 4);
  const baseRadius = size === "large" ? 40 : size === "medium" ? 25 : 12;
  const points: Vector[] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const radius = baseRadius + (Math.random() - 0.5) * baseRadius * 0.4;
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  const angle = Math.random() * Math.PI * 2;
  const waveBonus = 1 + (wave - 1) * 0.08;
  const variance = size === "large" ? (0.3 + Math.random() * 1.2) : (0.8 + Math.random() * 0.4);
  const speed = ASTEROID_SPEEDS[size] * variance * waveBonus;
  return {
    id: asteroidIdCounter++,
    pos: { x, y }, vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    rotation: Math.random() * Math.PI * 2, size, points,
    rotationSpeed: (Math.random() - 0.5) * 0.04,
  };
}

function createAlien(type: "brown" | "greenMan"): Alien {
  const side = Math.random() < 0.5 ? -20 : W + 20;
  const waveBonus = 1 + (wave - 1) * 0.05;
  const speed = (type === "brown" ? (2 + Math.random() * 1.5) : (0.8 + Math.random() * 0.4)) * waveBonus;
  const dir = side < 0 ? 1 : -1;
  return {
    pos: { x: side, y: 30 + Math.random() * (H - 60) },
    vel: { x: dir * speed, y: (Math.random() - 0.5) * speed * 0.5 },
    type, hp: type === "brown" ? 1 : 2,
    moveTimer: 0, shootTimer: type === "greenMan" ? 90 + Math.random() * 60 : 9999,
    zigzagPhase: Math.random() * Math.PI * 2,
  };
}

function createPowerUp(x: number, y: number): PowerUp | null {
  if (Math.random() > 0.2) return null;
  const types: PowerUp["type"][] = ["shield", "rapidFire", "extraLife", "multiplier"];
  const type = types[Math.floor(Math.random() * types.length)];
  return {
    pos: { x, y },
    vel: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 },
    rotation: 0,
    type,
    lifetime: 300,
  };
}

function createBoss(w: number): Boss {
  const bossIndex = (w / 5 - 1) % 4;
  const bossTypes: Boss["bossType"][] = ["amigaBall", "flyingSaucer", "tentacle", "borgCube"];
  const bossType = bossTypes[bossIndex] || "tentacle";
  const baseHp = 3 + w + (playerCount - 2) * 2; // scale HP with player count

  const base: Boss = {
    pos: { x: W / 2, y: -80 }, vel: { x: 0, y: 0 }, rotation: 0,
    hp: baseHp, maxHp: baseHp,
    tentacles: Math.min(4 + Math.floor(w / 5), 8),
    shootTimer: 120, hitFlash: 0, phase: 0,
    entered: false, targetY: 100 + Math.random() * 60, bossType,
  };

  if (bossType === "amigaBall") {
    base.hp = Math.floor(baseHp * 1.2); base.maxHp = base.hp;
    base.bounceVelX = 1 + Math.random() * 1; base.bounceVelY = -3;
    base.rotAngle = 0; base.lastBounceFrame = 0; base.targetY = 150;
  } else if (bossType === "flyingSaucer") {
    base.hp = Math.floor(baseHp * 1.5); base.maxHp = base.hp;
    base.tractorBeamActive = false; base.sweepAngle = 0;
    base.miniSaucerTimer = 300; base.miniSaucers = []; base.targetY = 120;
  } else if (bossType === "borgCube") {
    base.hp = Math.floor(baseHp * 1.8); base.maxHp = base.hp;
    base.cubeRotX = 0; base.cubeRotY = 0; base.regenTimer = 0;
    base.gridLaserTimer = 180; base.adaptPhase = 0;
    base.targetY = 130; base.miniCubeTimer = 300 + Math.random() * 180; base.miniCubes = [];
  }
  return base;
}

function wrap(pos: Vector): Vector {
  return { x: ((pos.x % W) + W) % W, y: ((pos.y % H) + H) % H };
}

function dist(a: Vector, b: Vector): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getAsteroidsPerWave(w: number): number {
  return Math.min(3 + w, 10);
}

function isBossWave(w: number): boolean { return w % 5 === 0; }

function getAlivePlayers(): number[] {
  return ships.map((_, i) => i).filter(i => !eliminated[i]);
}

function getRandomAlivePlayer(): number {
  const alive = getAlivePlayers();
  if (alive.length === 0) return 0;
  return alive[Math.floor(Math.random() * alive.length)];
}

function getNearestAlivePlayer(pos: Vector): number {
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < playerCount; i++) {
    if (eliminated[i] || respawnTimer[i] > 0) continue;
    const d = dist(pos, ships[i].pos);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best >= 0 ? best : getRandomAlivePlayer();
}

function spawnWaveAsteroids() {
  const count = getAsteroidsPerWave(wave);
  asteroidsThisWave = count;
  asteroidsKilledThisWave = 0;
  const safePositions = ships.map((s, i) => ({ pos: s.pos, active: !eliminated[i] }));
  for (let i = 0; i < count; i++) {
    let x: number, y: number;
    let attempts = 0;
    do {
      x = Math.random() * W; y = Math.random() * H;
      attempts++;
    } while (
      attempts < 20 &&
      safePositions.some(({ pos, active }) => active && Math.hypot(x - pos.x, y - pos.y) < 100)
    );
    asteroids.push(createAsteroid(x, y, "large"));
  }
}

function initGame() {
  ships = [];
  bullets = [];
  lives = [];
  eliminated = [];
  powerUpActive = [];
  respawnTimer = [];
  lastShotTime = [];
  hyperspacePressed = [];
  inputs = [];

  const positions = playerCount <= 2
    ? [{ x: W * 0.25, y: H / 2 }, { x: W * 0.75, y: H / 2 }]
    : Array.from({ length: playerCount }, (_, i) => getStartPos(i, playerCount));

  for (let i = 0; i < playerCount; i++) {
    const pos = positions[i] ?? getStartPos(i, playerCount);
    ships.push(createShip(pos.x, pos.y, i));
    bullets.push([]);
    lives.push(INITIAL_LIVES);
    eliminated.push(false);
    powerUpActive.push({ shield: 0, rapidFire: 0, multiplier: 0 });
    respawnTimer.push(0);
    lastShotTime.push(0);
    hyperspacePressed.push(false);
    inputs.push({ left: false, right: false, up: false, fire: false, hyperspace: false });
  }

  asteroids = []; aliens = []; powerUps = []; boss = null;
  score = 0; wave = 1;
  alienSpawnTimer = 800;
  waveComplete = false; waveCompleteTimer = 0;
  bossDefeated = false; gameOver = false;
  tick = 0; asteroidIdCounter = 0;
  spawnWaveAsteroids();
}

function doHyperspace(playerIdx: number) {
  const ship = ships[playerIdx];
  if (!ship || ship.hyperspaceCooldown > 0 || eliminated[playerIdx]) return;

  let bestX = Math.random() * W, bestY = Math.random() * H;
  let bestSafety = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    const tx = Math.random() * W, ty = Math.random() * H;
    const safety = Math.min(
      ...asteroids.map(a => dist({ x: tx, y: ty }, a.pos)),
      ...aliens.map(a => dist({ x: tx, y: ty }, a.pos)),
      boss ? dist({ x: tx, y: ty }, boss.pos) : 999,
      ...ships.filter((_, i) => i !== playerIdx && !eliminated[i]).map(s => dist({ x: tx, y: ty }, s.pos))
    );
    if (safety > bestSafety) { bestSafety = safety; bestX = tx; bestY = ty; }
  }

  ship.pos = { x: bestX, y: bestY };
  ship.vel = { x: 0, y: 0 };
  ship.hyperspaceCooldown = HYPERSPACE_COOLDOWN;
  ship.invulnerable = true; ship.invulnerableTime = 120;
  pendingEvents.push({ type: "explosion", x: bestX, y: bestY, color: "#88FFFF", count: 8 });
}

function updateShip(idx: number) {
  const ship = ships[idx];
  const input = inputs[idx];
  if (!ship || !input) return;

  if (input.left) ship.rotation -= ship.rotationSpeed;
  if (input.right) ship.rotation += ship.rotationSpeed;
  ship.isThrusting = input.up;
  if (input.up) {
    ship.vel.x += Math.cos(ship.rotation) * ship.thrust;
    ship.vel.y += Math.sin(ship.rotation) * ship.thrust;
  }
  const maxSpeed = 8;
  const speed = Math.hypot(ship.vel.x, ship.vel.y);
  if (speed > maxSpeed) {
    ship.vel.x = (ship.vel.x / speed) * maxSpeed;
    ship.vel.y = (ship.vel.y / speed) * maxSpeed;
  }
  ship.vel.x *= 0.99; ship.vel.y *= 0.99;
  ship.pos.x += ship.vel.x; ship.pos.y += ship.vel.y;
  ship.pos = wrap(ship.pos);
  if (ship.invulnerableTime > 0) {
    ship.invulnerableTime--;
    if (ship.invulnerableTime === 0) ship.invulnerable = false;
  }
  if (ship.hyperspaceCooldown > 0) ship.hyperspaceCooldown--;
}

function updateBoss() {
  if (!boss) return;
  boss.phase += 0.02;
  if (boss.hitFlash > 0) boss.hitFlash--;

  if (!boss.entered) {
    boss.pos.y += 0.8;
    if (boss.pos.y >= boss.targetY) { boss.entered = true; boss.vel.x = 0.5; }
    return;
  }

  const targetIdx = getNearestAlivePlayer(boss.pos);
  const targetShip = ships[targetIdx];
  const targetPos = targetShip ? targetShip.pos : { x: W / 2, y: H / 2 };

  if (boss.bossType === "tentacle") {
    boss.pos.x += boss.vel.x;
    if (boss.pos.x < 100 || boss.pos.x > W - 100) boss.vel.x *= -1;
    boss.pos.y = boss.targetY + Math.sin(boss.phase) * 30;
    boss.shootTimer--;
    if (boss.shootTimer <= 0) {
      boss.shootTimer = Math.max(40, 90 - wave * 3);
      const baseAngle = Math.atan2(targetPos.y - boss.pos.y, targetPos.x - boss.pos.x);
      for (let i = -1; i <= 1; i++) {
        bullets[0].push({
          pos: { ...boss.pos },
          vel: { x: Math.cos(baseAngle + i * 0.3) * 4, y: Math.sin(baseAngle + i * 0.3) * 4 },
          rotation: baseAngle + i * 0.3, lifetime: BULLET_LIFETIME * 1.5,
          owner: -1, isBoss: true,
        });
      }
    }
  } else if (boss.bossType === "amigaBall") {
    boss.rotAngle = (boss.rotAngle ?? 0) + 0.015;
    const gravity = 0.025;
    boss.bounceVelY = (boss.bounceVelY ?? 0) + gravity;
    boss.bounceVelX = boss.bounceVelX ?? 1;
    boss.pos.x += boss.bounceVelX;
    boss.pos.y += boss.bounceVelY;
    boss.lastBounceFrame = (boss.lastBounceFrame ?? 0) + 1;
    if (boss.pos.x < 60 || boss.pos.x > W - 60) {
      boss.bounceVelX *= -1;
      boss.pos.x = Math.max(60, Math.min(W - 60, boss.pos.x));
    }
    if (boss.pos.y > H - 80) {
      boss.bounceVelY = -(Math.abs(boss.bounceVelY) * 0.5 + 0.5 + Math.random() * 2);
      boss.pos.y = H - 80;
      if ((boss.lastBounceFrame ?? 0) > 30) {
        boss.lastBounceFrame = 0;
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          pendingEvents.push({ type: "explosion", x: boss.pos.x, y: boss.pos.y + 50, color: "#FF4444", count: 2 });
        }
      }
    }
    if (boss.pos.y < 40) { boss.bounceVelY = Math.abs(boss.bounceVelY); boss.pos.y = 40; }
    boss.shootTimer--;
    if (boss.shootTimer <= 0) {
      boss.shootTimer = Math.max(90, 180 - wave * 2);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        bullets[0].push({
          pos: { ...boss.pos },
          vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
          rotation: ang, lifetime: BULLET_LIFETIME * 2.5, owner: -1, isBoss: true,
        });
      }
    }
  } else if (boss.bossType === "flyingSaucer") {
    boss.pos.x += Math.sin(boss.phase * 0.5) * 1.5;
    boss.pos.y = boss.targetY + Math.sin(boss.phase * 0.3) * 20;
    boss.sweepAngle = (boss.sweepAngle ?? 0) + 0.02;
    boss.tractorBeamActive = Math.sin(boss.phase * 1.5) > 0.3;
    if (boss.tractorBeamActive) {
      for (let i = 0; i < playerCount; i++) {
        if (!eliminated[i] && !ships[i].invulnerable && respawnTimer[i] === 0) {
          ships[i].vel.x += (boss.pos.x - ships[i].pos.x) * 0.001;
          ships[i].vel.y += (boss.pos.y - ships[i].pos.y) * 0.001;
        }
      }
    }
    boss.miniSaucerTimer = (boss.miniSaucerTimer ?? 300) - 1;
    if (!boss.miniSaucers) boss.miniSaucers = [];
    if (boss.miniSaucerTimer <= 0 && boss.miniSaucers.length < 3) {
      boss.miniSaucerTimer = 250 + Math.random() * 100;
      boss.miniSaucers.push({
        pos: { ...boss.pos }, vel: { x: (Math.random() - 0.5) * 3, y: 1 + Math.random() * 2 },
        hp: 1, shootTimer: 60 + Math.random() * 40,
      });
    }
    boss.miniSaucers = boss.miniSaucers.filter(ms => {
      ms.pos.x += ms.vel.x; ms.pos.y += ms.vel.y;
      ms.shootTimer--;
      if (ms.shootTimer <= 0) {
        ms.shootTimer = 80 + Math.random() * 40;
        const tgt = getNearestAlivePlayer(ms.pos);
        const tgtPos = ships[tgt]?.pos ?? targetPos;
        const ang = Math.atan2(tgtPos.y - ms.pos.y, tgtPos.x - ms.pos.x);
        bullets[0].push({
          pos: { ...ms.pos }, vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 },
          rotation: ang, lifetime: BULLET_LIFETIME, owner: -1, isBoss: true,
        });
      }
      return ms.pos.y < H + 30 && ms.pos.x > -30 && ms.pos.x < W + 30;
    });
    boss.shootTimer--;
    if (boss.shootTimer <= 0) {
      boss.shootTimer = Math.max(80, 160 - wave * 2);
      const laserAngle = boss.sweepAngle!;
      for (let d = 0; d < 300; d += 20) {
        bullets[0].push({
          pos: { x: boss.pos.x + Math.cos(laserAngle) * d, y: boss.pos.y + Math.sin(laserAngle) * d },
          vel: { x: Math.cos(laserAngle) * 3.5, y: Math.sin(laserAngle) * 3.5 },
          rotation: laserAngle, lifetime: 20, owner: -1, isBoss: true,
        });
      }
    }
  } else if (boss.bossType === "borgCube") {
    boss.cubeRotX = (boss.cubeRotX ?? 0) + 0.008;
    boss.cubeRotY = (boss.cubeRotY ?? 0) + 0.012;
    boss.adaptPhase = (boss.adaptPhase ?? 0) + 0.01;
    boss.pos.x += (targetPos.x - boss.pos.x) * 0.005;
    boss.pos.y = boss.targetY + Math.sin(boss.adaptPhase) * 15;
    boss.regenTimer = (boss.regenTimer ?? 0) + 1;
    if (boss.regenTimer >= 300 && boss.hp < boss.maxHp) {
      boss.hp = Math.min(boss.maxHp, boss.hp + 1);
      boss.regenTimer = 0;
      pendingEvents.push({ type: "explosion", x: boss.pos.x, y: boss.pos.y, color: "#00FF44", count: 2 });
    }
    boss.gridLaserTimer = (boss.gridLaserTimer ?? 180) - 1;
    if (boss.gridLaserTimer <= 0) {
      boss.gridLaserTimer = Math.max(120, 240 - wave * 3);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + (boss.cubeRotX ?? 0);
        bullets[0].push({
          pos: { ...boss.pos }, vel: { x: Math.cos(ang) * 2.5, y: Math.sin(ang) * 2.5 },
          rotation: ang, lifetime: BULLET_LIFETIME * 1.5, owner: -1, isBoss: true,
        });
      }
    }
    boss.shootTimer--;
    if (boss.shootTimer <= 0) {
      boss.shootTimer = Math.max(60, 120 - wave * 2);
      const ang = Math.atan2(targetPos.y - boss.pos.y, targetPos.x - boss.pos.x);
      bullets[0].push({
        pos: { ...boss.pos }, vel: { x: Math.cos(ang) * 2.8, y: Math.sin(ang) * 2.8 },
        rotation: ang, lifetime: BULLET_LIFETIME * 1.5, owner: -1, isBoss: true,
      });
    }
    boss.miniCubeTimer = (boss.miniCubeTimer ?? 300) - 1;
    if (!boss.miniCubes) boss.miniCubes = [];
    if (boss.miniCubeTimer <= 0) {
      boss.miniCubeTimer = 300 + Math.random() * 180;
      const ang = Math.random() * Math.PI * 2;
      boss.miniCubes.push({
        pos: { ...boss.pos },
        vel: { x: Math.cos(ang) * 0.8 + (targetPos.x - boss.pos.x) * 0.003, y: Math.sin(ang) * 0.8 + (targetPos.y - boss.pos.y) * 0.003 },
        hp: 1, rotAngle: Math.random() * Math.PI * 2,
      });
    }
    boss.miniCubes = boss.miniCubes.filter(mc => {
      mc.pos.x += mc.vel.x; mc.pos.y += mc.vel.y; mc.rotAngle += 0.03;
      mc.vel.x += (targetPos.x - mc.pos.x) * 0.0005;
      mc.vel.y += (targetPos.y - mc.pos.y) * 0.0005;
      // Bullet hits
      let alive = true;
      for (let pi = 0; pi < playerCount; pi++) {
        bullets[pi] = bullets[pi].filter(b => {
          if (!b.isBoss && Math.hypot(b.pos.x - mc.pos.x, b.pos.y - mc.pos.y) < 12) {
            alive = false;
            pendingEvents.push({ type: "explosion", x: mc.pos.x, y: mc.pos.y, color: "#00FF44", count: 4 });
            return false;
          }
          return true;
        });
        if (!alive) break;
      }
      return alive && mc.pos.x > -50 && mc.pos.x < W + 50 && mc.pos.y > -50 && mc.pos.y < H + 50;
    });
  }
}

function killPlayer(playerIdx: number) {
  const ship = ships[playerIdx];
  const colors = ["#00FFFF", "#FF8844", "#FF44FF", "#FFFF44", "#44FF44", "#FF4444", "#44FFFF", "#FF88FF"];
  const color = colors[playerIdx % colors.length];
  pendingEvents.push({ type: "die_env", x: ship.pos.x, y: ship.pos.y, color, count: 20, player: playerIdx });
  lives[playerIdx]--;
  if (lives[playerIdx] <= 0) {
    lives[playerIdx] = 0;
    // Permanent death: eliminate this player
    eliminated[playerIdx] = true;
    ship.pos = { x: -1000, y: -1000 };
    ship.vel = { x: 0, y: 0 };
    ship.invulnerable = true; ship.invulnerableTime = 999;
    bullets[playerIdx] = [];
  } else {
    respawnTimer[playerIdx] = 150;
    ship.pos = { x: -1000, y: -1000 };
    ship.vel = { x: 0, y: 0 };
    ship.invulnerable = true; ship.invulnerableTime = 999;
  }
}

function updateTick() {
  if (gameOver) return;
  tick++;

  // Wave complete logic
  if (waveComplete) {
    waveCompleteTimer--;
    if (waveCompleteTimer <= 0) {
      wave++;
      asteroids = []; aliens = []; powerUps = []; boss = null; bossDefeated = false;
      alienSpawnTimer = Math.max(300, 800 - wave * 30);
      waveComplete = false;
      spawnWaveAsteroids();
      // Brief invulnerability for new wave
      for (let i = 0; i < playerCount; i++) {
        if (!eliminated[i]) { ships[i].invulnerable = true; ships[i].invulnerableTime = 90; }
      }
      // Spawn boss on boss waves
      if (isBossWave(wave)) {
        boss = createBoss(wave);
        const bossNames: Record<string, string> = {
          tentacle: "BOSS", amigaBall: "AMIGA BALL", flyingSaucer: "FLYING SAUCER", borgCube: "BORG CUBE",
        };
        const bossLabel = bossNames[boss.bossType] || "BOSS";
        pendingEvents.push({ type: "boss_spawn", x: W / 2, y: H / 2, color: "#FF4444", count: 0, label: `⚠ ${bossLabel} INCOMING ⚠` });
      }
    }
    return;
  }

  // Respawn timers
  for (let p = 0; p < playerCount; p++) {
    if (eliminated[p]) continue;
    if (respawnTimer[p] > 0) {
      respawnTimer[p]--;
      if (respawnTimer[p] === 0) {
        const safePos = getStartPos(p, playerCount);
        const ship = ships[p];
        ship.pos = { ...safePos };
        ship.vel = { x: 0, y: 0 };
        ship.invulnerable = true; ship.invulnerableTime = 120;
      }
    }
  }

  // Update ships and handle hyperspace
  for (let p = 0; p < playerCount; p++) {
    if (eliminated[p] || respawnTimer[p] > 0) continue;
    const inp = inputs[p];
    // Edge-detect hyperspace (only trigger on key-down)
    if (inp.hyperspace && !hyperspacePressed[p]) {
      doHyperspace(p);
    }
    hyperspacePressed[p] = !!inp.hyperspace;
    updateShip(p);
  }

  // Shooting
  for (let p = 0; p < playerCount; p++) {
    if (eliminated[p] || respawnTimer[p] > 0) continue;
    const input = inputs[p];
    const ship = ships[p];
    const fireRate = powerUpActive[p].rapidFire > 0 ? 8 : 15;
    if (input.fire && ship.invulnerableTime <= 60) {
      if (tick - lastShotTime[p] >= fireRate) {
        lastShotTime[p] = tick;
        bullets[p].push({
          pos: { ...ship.pos },
          vel: { x: Math.cos(ship.rotation) * BULLET_SPEED + ship.vel.x, y: Math.sin(ship.rotation) * BULLET_SPEED + ship.vel.y },
          rotation: ship.rotation, lifetime: BULLET_LIFETIME, owner: p,
        });
      }
    }
  }

  // Update bullets
  for (let p = 0; p < playerCount; p++) {
    bullets[p] = bullets[p].filter(bullet => {
      bullet.pos.x += bullet.vel.x; bullet.pos.y += bullet.vel.y;
      bullet.pos = wrap(bullet.pos);
      return --bullet.lifetime > 0;
    });
  }

  // Update asteroids
  asteroids.forEach(a => {
    a.pos.x += a.vel.x; a.pos.y += a.vel.y;
    a.pos = wrap(a.pos); a.rotation += a.rotationSpeed;
  });

  // Spawn aliens (not on boss waves while boss is alive)
  if (!boss) {
    const maxAliens = Math.min(1 + Math.floor(wave / 3), 4);
    if (--alienSpawnTimer <= 0 && aliens.length < maxAliens) {
      const greenChance = Math.min(0.1 + wave * 0.05, 0.5);
      aliens.push(createAlien(Math.random() < greenChance ? "greenMan" : "brown"));
      alienSpawnTimer = Math.max(300, 600 - wave * 20) + Math.random() * 200;
    }
  }

  // Update aliens
  aliens = aliens.filter(alien => {
    alien.moveTimer++; alien.zigzagPhase += 0.05;
    alien.pos.x += alien.vel.x; alien.pos.y += alien.vel.y;
    if ((alien.pos.x < -60 || alien.pos.x > W + 60) && alien.moveTimer > 120) return false;
    if (alien.pos.y < 0) alien.pos.y = H;
    if (alien.pos.y > H) alien.pos.y = 0;
    return true;
  });

  // Update power-ups
  powerUps = powerUps.filter(pu => {
    pu.pos.x += pu.vel.x; pu.pos.y += pu.vel.y;
    pu.pos = wrap(pu.pos); pu.rotation += 0.05;
    return --pu.lifetime > 0;
  });

  // Update boss
  if (boss) updateBoss();

  // Update active power-up timers per player
  for (let p = 0; p < playerCount; p++) {
    const pa = powerUpActive[p];
    if (pa.shield > 0) pa.shield--;
    if (pa.rapidFire > 0) pa.rapidFire--;
    if (pa.multiplier > 0) pa.multiplier--;
  }

  // === Collisions ===

  // Ships vs asteroids & aliens
  for (let p = 0; p < playerCount; p++) {
    const ship = ships[p];
    if (ship.invulnerable || eliminated[p] || respawnTimer[p] > 0) continue;
    const shielded = powerUpActive[p].shield > 0;

    for (const asteroid of asteroids) {
      const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
      if (dist(ship.pos, asteroid.pos) < SHIP_SIZE + radius) {
        if (!shielded) killPlayer(p); break;
      }
    }
    if (eliminated[p]) continue;

    for (const alien of aliens) {
      if (dist(ship.pos, alien.pos) < SHIP_SIZE + 12) {
        if (!shielded) killPlayer(p); break;
      }
    }
    if (eliminated[p]) continue;

    // Ship vs boss bullets
    const allBossBullets = bullets[0].filter(b => b.isBoss);
    for (const b of allBossBullets) {
      if (dist(ship.pos, b.pos) < SHIP_SIZE + 3) {
        if (!shielded) killPlayer(p); break;
      }
    }
    if (eliminated[p]) continue;

    // Ship vs boss body
    if (boss && boss.entered && dist(ship.pos, boss.pos) < SHIP_SIZE + 40) {
      if (!shielded) killPlayer(p);
    }
  }

  // Bullets vs asteroids
  const newAsteroids: Asteroid[] = [];
  for (let p = 0; p < playerCount; p++) {
    bullets[p] = bullets[p].filter(bullet => {
      if (bullet.isBoss) return true; // boss bullets handled elsewhere
      let alive = true;
      asteroids = asteroids.filter(asteroid => {
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        if (dist(bullet.pos, asteroid.pos) < 2 + radius) {
          alive = false;
          const multiplier = powerUpActive[bullet.owner >= 0 ? bullet.owner : 0].multiplier > 0 ? 2 : 1;
          let pts = 0;
          if (asteroid.size === "large") {
            pts = SCORE_LARGE * multiplier;
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium"));
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium"));
          } else if (asteroid.size === "medium") {
            pts = SCORE_MEDIUM * multiplier;
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small"));
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small"));
          } else {
            pts = SCORE_SMALL * multiplier;
            asteroidsKilledThisWave++;
            const pu = createPowerUp(asteroid.pos.x, asteroid.pos.y);
            if (pu) powerUps.push(pu);
          }
          score += pts;
          pendingEvents.push({ type: "explosion", x: asteroid.pos.x, y: asteroid.pos.y, color: "#FFFFFF", count: 8 });
          pendingEvents.push({ type: "score_pop", x: asteroid.pos.x, y: asteroid.pos.y, color: "#FFFF00", count: 0, points: pts });
          return false;
        }
        return true;
      });
      return alive;
    });
  }
  asteroids.push(...newAsteroids);

  // Bullets vs aliens
  for (let p = 0; p < playerCount; p++) {
    bullets[p] = bullets[p].filter(bullet => {
      if (bullet.isBoss) return true;
      let alive = true;
      aliens = aliens.filter(alien => {
        if (dist(bullet.pos, alien.pos) < 14) {
          alive = false;
          if (--alien.hp <= 0) {
            const multiplier = powerUpActive[bullet.owner >= 0 ? bullet.owner : 0].multiplier > 0 ? 2 : 1;
            const pts = SCORE_ALIEN * multiplier;
            score += pts;
            pendingEvents.push({ type: "explosion", x: alien.pos.x, y: alien.pos.y, color: "#AA6633", count: 10 });
            pendingEvents.push({ type: "score_pop", x: alien.pos.x, y: alien.pos.y, color: "#FFFF00", count: 0, points: pts });
            const pu = createPowerUp(alien.pos.x, alien.pos.y);
            if (pu) powerUps.push(pu);
            return false;
          }
        }
        return true;
      });
      return alive;
    });
  }

  // Bullets vs boss
  if (boss) {
    for (let p = 0; p < playerCount; p++) {
      bullets[p] = bullets[p].filter(bullet => {
        if (bullet.isBoss) return true;
        const bossRadius = boss!.bossType === "amigaBall" ? 50 : boss!.bossType === "flyingSaucer" ? 55 : boss!.bossType === "borgCube" ? 45 : 45;
        if (dist(bullet.pos, boss!.pos) < 2 + bossRadius) {
          boss!.hp--;
          boss!.hitFlash = 8;
          if (boss!.hp <= 0) {
            const multiplier = powerUpActive[p].multiplier > 0 ? 2 : 1;
            const pts = SCORE_BOSS * multiplier;
            score += pts;
            pendingEvents.push({ type: "explosion", x: boss!.pos.x, y: boss!.pos.y, color: "#FF44CC", count: 30 });
            pendingEvents.push({ type: "score_pop", x: boss!.pos.x, y: boss!.pos.y, color: "#FFFF00", count: 0, points: pts });
            boss = null;
            bossDefeated = true;
            waveComplete = true;
            waveCompleteTimer = 180;
          }
          return false;
        }
        return true;
      });
      if (!boss) break;
    }
  }

  // Power-up collection
  for (let p = 0; p < playerCount; p++) {
    if (eliminated[p] || respawnTimer[p] > 0) continue;
    const ship = ships[p];
    powerUps = powerUps.filter(pu => {
      if (dist(ship.pos, pu.pos) < SHIP_SIZE + 14) {
        const labels: Record<string, string> = {
          shield: "SHIELD!", rapidFire: "RAPID FIRE!", extraLife: "+1 LIFE!", multiplier: "2× SCORE!",
        };
        pendingEvents.push({ type: "powerup", x: pu.pos.x, y: pu.pos.y, color: "#FFFFFF", count: 0, player: p, label: labels[pu.type] });
        switch (pu.type) {
          case "shield": powerUpActive[p].shield = 300; break;
          case "rapidFire": powerUpActive[p].rapidFire = 600; break;
          case "extraLife":
            if (lives[p] < 5) {
              lives[p]++;
              pendingEvents.push({ type: "score_pop", x: pu.pos.x, y: pu.pos.y, color: "#CC66FF", count: 0, points: 0 });
            }
            break;
          case "multiplier": powerUpActive[p].multiplier = 900; break;
        }
        return false;
      }
      return true;
    });
  }

  // Remove boss bullets from shared array after collision processing
  if (bullets[0]) {
    bullets[0] = bullets[0].filter(b => !b.isBoss || b.lifetime > 0);
  }

  // Check game over: all players eliminated
  const aliveCount = eliminated.filter(e => !e).length;
  if (aliveCount === 0) {
    gameOver = true;
    return;
  }

  // Check wave complete: no boss wave or boss defeated, all asteroids cleared
  if (!waveComplete && asteroids.length === 0 && !boss && !isBossWave(wave)) {
    waveComplete = true;
    waveCompleteTimer = 180;
  }
  // Boss wave: wave complete only when boss is defeated (handled in boss bullet collision)
}

function buildAndSendState() {
  const state = {
    ships: ships.map(s => ({
      x: s.pos.x, y: s.pos.y, vx: s.vel.x, vy: s.vel.y,
      rot: s.rotation, thrust: s.isThrusting, invuln: s.invulnerable,
      invulnTime: s.invulnerableTime, hyperspaceCooldown: s.hyperspaceCooldown,
    })),
    bullets: bullets.map(arr => arr
      .filter(b => !b.isBoss)
      .map(b => ({ x: b.pos.x, y: b.pos.y, vx: b.vel.x, vy: b.vel.y, rot: b.rotation, lifetime: b.lifetime, owner: b.owner }))
    ),
    asteroids: asteroids.map(a => ({
      id: a.id, x: a.pos.x, y: a.pos.y, vx: a.vel.x, vy: a.vel.y,
      size: a.size, rot: a.rotation, rotSpeed: a.rotationSpeed,
      points: a.points.flatMap(p => [p.x, p.y]),
    })),
    aliens: aliens.map(a => ({ x: a.pos.x, y: a.pos.y, vx: a.vel.x, vy: a.vel.y, type: a.type })),
    powerUps: powerUps.map(pu => ({ x: pu.pos.x, y: pu.pos.y, rotation: pu.rotation, type: pu.type })),
    boss: boss ? {
      x: boss.pos.x, y: boss.pos.y, rotation: boss.rotation,
      hp: boss.hp, maxHp: boss.maxHp,
      phase: boss.phase, hitFlash: boss.hitFlash,
      entered: boss.entered, targetY: boss.targetY,
      bossType: boss.bossType, tentacles: boss.tentacles, shootTimer: boss.shootTimer,
      bounceVelX: boss.bounceVelX, bounceVelY: boss.bounceVelY, rotAngle: boss.rotAngle,
      tractorBeamActive: boss.tractorBeamActive, sweepAngle: boss.sweepAngle,
      miniSaucers: boss.miniSaucers?.map(ms => ({ x: ms.pos.x, y: ms.pos.y })) ?? [],
      cubeRotX: boss.cubeRotX, cubeRotY: boss.cubeRotY, regenTimer: boss.regenTimer,
      miniCubes: boss.miniCubes?.map(mc => ({ x: mc.pos.x, y: mc.pos.y, rotAngle: mc.rotAngle })) ?? [],
    } : null,
    score,
    lives: [...lives],
    eliminated: [...eliminated],
    wave,
    respawnTimer: [...respawnTimer],
    powerUpActive: powerUpActive.map(pa => ({ ...pa })),
    hyperspaceCooldown: ships.map(s => s.hyperspaceCooldown),
    waveComplete,
    gameOver,
    events: pendingEvents,
    tick,
    playerCount,
  };
  pendingEvents = [];
  postMessage({ type: "state", data: state });
}

onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "init") {
    if (msg.turnSpeed != null) workerTurnSpeed = msg.turnSpeed;
    if (msg.playerCount != null) playerCount = Math.max(1, Math.min(MAX_PLAYERS, msg.playerCount));
    initGame();
    // Spawn boss if wave 5+
    if (isBossWave(wave)) {
      boss = createBoss(wave);
    }
    if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null; }
    workerLastTime = performance.now();
    workerAccumulator = 0;
    pendingEvents = [];
    workerLoop();
  } else if (msg.type === "inputs") {
    const newInputs: InputState[] = msg.inputs;
    for (let i = 0; i < newInputs.length && i < playerCount; i++) {
      inputs[i] = newInputs[i];
    }
    if (msg.turnSpeed != null) {
      workerTurnSpeed = msg.turnSpeed;
      for (const s of ships) s.rotationSpeed = workerTurnSpeed;
    }
  } else if (msg.type === "stop") {
    if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null; }
    pendingEvents = [];
  }
};

function workerLoop() {
  const now = performance.now();
  const delta = Math.min(now - workerLastTime, 250);
  workerLastTime = now;
  workerAccumulator += delta;

  while (workerAccumulator >= FIXED_TIMESTEP) {
    updateTick();
    workerAccumulator -= FIXED_TIMESTEP;
  }

  buildAndSendState();

  const nextDelay = Math.max(0, FIXED_TIMESTEP - workerAccumulator);
  timeoutId = setTimeout(workerLoop, nextDelay);
}
