// Co-op physics worker – two ships fight cooperatively against waves of enemies.
// Friendly fire is OFF; both players share a score pool and each have their own lives.
// No imports – all types and logic are inline for worker isolation.

interface Vector { x: number; y: number; }

interface Ship {
  pos: Vector; vel: Vector; rotation: number;
  rotationSpeed: number; thrust: number; isThrusting: boolean;
  invulnerable: boolean; invulnerableTime: number;
}

interface Asteroid {
  id: number; pos: Vector; vel: Vector; rotation: number;
  size: "large" | "medium" | "small"; points: Vector[]; rotationSpeed: number;
}

interface Bullet {
  pos: Vector; vel: Vector; rotation: number; lifetime: number; owner: number;
}

interface Alien {
  pos: Vector; vel: Vector; type: "brown" | "greenMan";
  hp: number; moveTimer: number; shootTimer: number; zigzagPhase: number;
}

interface InputState { left: boolean; right: boolean; up: boolean; fire: boolean; }

interface GameEvent {
  type: "explosion" | "kill" | "die_env" | "score_pop";
  x: number; y: number; color: string; count: number;
  player?: number; killer?: number; points?: number;
}

const W = 800, H = 600, SHIP_SIZE = 10, BULLET_SPEED = 7, BULLET_LIFETIME = 60;
const ASTEROID_SPEEDS: Record<string, number> = { large: 0.5, medium: 0.8, small: 1.2 };
const FIXED_TIMESTEP = 1000 / 60;
const INITIAL_LIVES = 3;

// Score values
const SCORE_LARGE = 20, SCORE_MEDIUM = 50, SCORE_SMALL = 100, SCORE_ALIEN = 200;

let workerTurnSpeed = 0.05;
let asteroidIdCounter = 0;
let ship1: Ship, ship2: Ship;
let bullets1: Bullet[] = [], bullets2: Bullet[] = [];
let asteroids: Asteroid[] = [], aliens: Alien[] = [];
let score = 0;
let lives1 = INITIAL_LIVES, lives2 = INITIAL_LIVES;
let wave = 1;
let respawnTimer: [number, number] = [0, 0];
let alienSpawnTimer = 800;
let asteroidsThisWave = 0;
let asteroidsKilledThisWave = 0;
let waveComplete = false;
let waveCompleteTimer = 0;
let gameOver = false;
let tick = 0;
let lastShotTime = [0, 0];
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let workerLastTime = 0;
let workerAccumulator = 0;
let pendingEvents: GameEvent[] = [];
let p1Input: InputState = { left: false, right: false, up: false, fire: false };
let p2Input: InputState = { left: false, right: false, up: false, fire: false };

function createShip(x: number, y: number): Ship {
  return {
    pos: { x, y }, vel: { x: 0, y: 0 },
    rotation: x < W / 2 ? 0 : Math.PI,
    rotationSpeed: workerTurnSpeed, thrust: 0.08, isThrusting: false,
    invulnerable: true, invulnerableTime: 120,
  };
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

function wrap(pos: Vector): Vector {
  return { x: ((pos.x % W) + W) % W, y: ((pos.y % H) + H) % H };
}

function dist(a: Vector, b: Vector): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getAsteroidsPerWave(wave: number): number {
  return Math.min(3 + wave, 10);
}

function spawnWaveAsteroids() {
  const count = getAsteroidsPerWave(wave);
  asteroidsThisWave = count;
  asteroidsKilledThisWave = 0;
  for (let i = 0; i < count; i++) {
    let x: number, y: number;
    do { x = Math.random() * W; y = Math.random() * H; }
    while (
      Math.hypot(x - W * 0.25, y - H / 2) < 100 ||
      Math.hypot(x - W * 0.75, y - H / 2) < 100
    );
    asteroids.push(createAsteroid(x, y, "large"));
  }
}

function initGame() {
  ship1 = createShip(W * 0.25, H / 2);
  ship2 = createShip(W * 0.75, H / 2);
  bullets1 = []; bullets2 = [];
  asteroids = []; aliens = [];
  score = 0; lives1 = INITIAL_LIVES; lives2 = INITIAL_LIVES;
  wave = 1;
  respawnTimer = [0, 0];
  alienSpawnTimer = 800;
  waveComplete = false; waveCompleteTimer = 0;
  gameOver = false;
  tick = 0; lastShotTime = [0, 0]; asteroidIdCounter = 0;
  spawnWaveAsteroids();
}

function updateShip(ship: Ship, input: InputState) {
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
}

function updateTick() {
  if (gameOver) return;
  tick++;

  // Wave complete: wait for all asteroids to be cleared, then advance
  if (waveComplete) {
    waveCompleteTimer--;
    if (waveCompleteTimer <= 0) {
      wave++;
      asteroids = []; aliens = [];
      alienSpawnTimer = Math.max(300, 800 - wave * 30);
      waveComplete = false;
      spawnWaveAsteroids();
      // Brief invulnerability for new wave
      ship1.invulnerable = true; ship1.invulnerableTime = 90;
      ship2.invulnerable = true; ship2.invulnerableTime = 90;
    }
    return;
  }

  // Respawn timers
  for (let p = 0; p < 2; p++) {
    if (respawnTimer[p] > 0) {
      respawnTimer[p]--;
      if (respawnTimer[p] === 0) {
        const ship = p === 0 ? ship1 : ship2;
        // Respawn away from center of action
        ship.pos = { x: p === 0 ? W * 0.25 : W * 0.75, y: H / 2 };
        ship.vel = { x: 0, y: 0 };
        ship.invulnerable = true; ship.invulnerableTime = 120;
      }
    }
  }

  if (respawnTimer[0] === 0) updateShip(ship1, p1Input);
  if (respawnTimer[1] === 0) updateShip(ship2, p2Input);

  // Shooting
  for (let p = 0; p < 2; p++) {
    const input = p === 0 ? p1Input : p2Input;
    const ship = p === 0 ? ship1 : ship2;
    const bArr = p === 0 ? bullets1 : bullets2;
    if (input.fire && respawnTimer[p] === 0 && ship.invulnerableTime <= 60) {
      if (tick - lastShotTime[p] >= 15) {
        lastShotTime[p] = tick;
        bArr.push({
          pos: { ...ship.pos },
          vel: { x: Math.cos(ship.rotation) * BULLET_SPEED + ship.vel.x, y: Math.sin(ship.rotation) * BULLET_SPEED + ship.vel.y },
          rotation: ship.rotation, lifetime: BULLET_LIFETIME, owner: p + 1,
        });
      }
    }
  }

  // Update bullets
  const updateBullets = (b: Bullet[]) => b.filter(bullet => {
    bullet.pos.x += bullet.vel.x; bullet.pos.y += bullet.vel.y;
    bullet.pos = wrap(bullet.pos);
    return --bullet.lifetime > 0;
  });
  bullets1 = updateBullets(bullets1);
  bullets2 = updateBullets(bullets2);

  // Update asteroids
  asteroids.forEach(a => {
    a.pos.x += a.vel.x; a.pos.y += a.vel.y;
    a.pos = wrap(a.pos); a.rotation += a.rotationSpeed;
  });

  // Spawn aliens (scales with wave)
  const maxAliens = Math.min(1 + Math.floor(wave / 3), 4);
  if (--alienSpawnTimer <= 0 && aliens.length < maxAliens) {
    const greenChance = Math.min(0.1 + wave * 0.05, 0.5);
    aliens.push(createAlien(Math.random() < greenChance ? "greenMan" : "brown"));
    alienSpawnTimer = Math.max(300, 600 - wave * 20) + Math.random() * 200;
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

  // === Collisions ===
  const killPlayer = (playerIdx: 0 | 1) => {
    const ship = playerIdx === 0 ? ship1 : ship2;
    const color = playerIdx === 0 ? "#00FFFF" : "#FF8844";
    pendingEvents.push({ type: "die_env", x: ship.pos.x, y: ship.pos.y, color, count: 20, player: playerIdx });
    if (playerIdx === 0) {
      lives1--;
      if (lives1 <= 0) lives1 = 0;
    } else {
      lives2--;
      if (lives2 <= 0) lives2 = 0;
    }
    respawnTimer[playerIdx] = 150;
    ship.pos = { x: -100, y: -100 }; ship.vel = { x: 0, y: 0 };
    ship.invulnerable = true; ship.invulnerableTime = 999;
  };

  // Ships vs asteroids
  for (let p = 0; p < 2; p++) {
    const ship = p === 0 ? ship1 : ship2;
    if (ship.invulnerable || respawnTimer[p] > 0) continue;
    for (const asteroid of asteroids) {
      const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
      if (dist(ship.pos, asteroid.pos) < SHIP_SIZE + radius) {
        killPlayer(p as 0 | 1); break;
      }
    }
  }

  // Ships vs aliens
  for (let p = 0; p < 2; p++) {
    const ship = p === 0 ? ship1 : ship2;
    if (ship.invulnerable || respawnTimer[p] > 0) continue;
    for (const alien of aliens) {
      if (dist(ship.pos, alien.pos) < SHIP_SIZE + 12) {
        killPlayer(p as 0 | 1); break;
      }
    }
  }

  // Bullets vs asteroids (for both players)
  const newAsteroids: Asteroid[] = [];
  const bulletVsAsteroids = (bArr: Bullet[]) => {
    return bArr.filter(bullet => {
      let alive = true;
      asteroids = asteroids.filter(asteroid => {
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        if (dist(bullet.pos, asteroid.pos) < 2 + radius) {
          alive = false;
          let pts = 0;
          if (asteroid.size === "large") {
            pts = SCORE_LARGE;
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium"));
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium"));
          } else if (asteroid.size === "medium") {
            pts = SCORE_MEDIUM;
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small"));
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small"));
          } else {
            pts = SCORE_SMALL;
            asteroidsKilledThisWave++;
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
  };
  bullets1 = bulletVsAsteroids(bullets1);
  bullets2 = bulletVsAsteroids(bullets2);
  asteroids.push(...newAsteroids);

  // Bullets vs aliens
  const bulletVsAliens = (bArr: Bullet[]) => {
    return bArr.filter(bullet => {
      let alive = true;
      aliens = aliens.filter(alien => {
        if (dist(bullet.pos, alien.pos) < 14) {
          alive = false;
          if (--alien.hp <= 0) {
            score += SCORE_ALIEN;
            pendingEvents.push({ type: "explosion", x: alien.pos.x, y: alien.pos.y, color: "#AA6633", count: 10 });
            pendingEvents.push({ type: "score_pop", x: alien.pos.x, y: alien.pos.y, color: "#FFFF00", count: 0, points: SCORE_ALIEN });
            return false;
          }
        }
        return true;
      });
      return alive;
    });
  };
  bullets1 = bulletVsAliens(bullets1);
  bullets2 = bulletVsAliens(bullets2);

  // Check game over: both players have 0 lives and are dead
  if (lives1 === 0 && lives2 === 0 && respawnTimer[0] > 0 && respawnTimer[1] > 0) {
    // Count down – game over triggers when the last respawn timer finishes and there are no lives
    if (respawnTimer[0] === 1 || respawnTimer[1] === 1) {
      gameOver = true;
    }
  }
  if (lives1 === 0 && lives2 === 0 && respawnTimer[0] === 0 && respawnTimer[1] === 0) {
    gameOver = true;
  }

  // Check wave complete: all asteroids cleared
  if (!waveComplete && asteroids.length === 0 && !gameOver) {
    waveComplete = true;
    waveCompleteTimer = 180; // 3 seconds at 60 Hz
  }
}

function buildAndSendState() {
  const state = {
    ship1: { x: ship1.pos.x, y: ship1.pos.y, vx: ship1.vel.x, vy: ship1.vel.y, rot: ship1.rotation, thrust: ship1.isThrusting, invuln: ship1.invulnerable, invulnTime: ship1.invulnerableTime },
    ship2: { x: ship2.pos.x, y: ship2.pos.y, vx: ship2.vel.x, vy: ship2.vel.y, rot: ship2.rotation, thrust: ship2.isThrusting, invuln: ship2.invulnerable, invulnTime: ship2.invulnerableTime },
    bullets1: bullets1.map(b => ({ x: b.pos.x, y: b.pos.y, vx: b.vel.x, vy: b.vel.y, rot: b.rotation, lifetime: b.lifetime, owner: b.owner })),
    bullets2: bullets2.map(b => ({ x: b.pos.x, y: b.pos.y, vx: b.vel.x, vy: b.vel.y, rot: b.rotation, lifetime: b.lifetime, owner: b.owner })),
    asteroids: asteroids.map(a => ({
      id: a.id, x: a.pos.x, y: a.pos.y, vx: a.vel.x, vy: a.vel.y,
      size: a.size, rot: a.rotation, rotSpeed: a.rotationSpeed,
      points: a.points.flatMap(p => [p.x, p.y]),
    })),
    aliens: aliens.map(a => ({ x: a.pos.x, y: a.pos.y, vx: a.vel.x, vy: a.vel.y, type: a.type })),
    score,
    lives1,
    lives2,
    wave,
    respawnTimer: [...respawnTimer] as [number, number],
    waveComplete,
    gameOver,
    events: pendingEvents,
    tick,
  };
  pendingEvents = [];
  postMessage({ type: "state", data: state });
}

onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "init") {
    if (msg.turnSpeed != null) workerTurnSpeed = msg.turnSpeed;
    initGame();
    if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null; }
    workerLastTime = performance.now();
    workerAccumulator = 0;
    pendingEvents = [];
    workerLoop();
  } else if (msg.type === "inputs") {
    p1Input = msg.p1;
    p2Input = msg.p2;
    if (msg.turnSpeed != null) {
      workerTurnSpeed = msg.turnSpeed;
      ship1.rotationSpeed = workerTurnSpeed;
      ship2.rotationSpeed = workerTurnSpeed;
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
