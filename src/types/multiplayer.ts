export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  fire: boolean;
  hyperspace?: boolean;
}

export interface NetShip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  thrust: boolean;
  invuln: boolean;
  invulnTime: number;
}

export interface NetBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  lifetime: number;
  owner: number;
}

export interface NetAsteroid {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: "large" | "medium" | "small";
  rot: number;
  rotSpeed: number;
  points: number[]; // flattened [x1,y1,x2,y2,...]
}

export interface NetAlien {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: "brown" | "greenMan" | "blueSentinel" | "purpleSwarm";
  isInvisible?: boolean;
  chargeTimer?: number;
  zigzagPhase?: number;
}

export interface GameEvent {
  type: "explosion" | "kill" | "die_env" | "score_pop" | "boss_spawn" | "powerup";
  x: number;
  y: number;
  color: string;
  count: number;
  player?: number;
  killer?: number;
  points?: number;
  label?: string;
}

export interface DuelNetState {
  ship1: NetShip;
  ship2: NetShip;
  bullets1: NetBullet[];
  bullets2: NetBullet[];
  asteroids: NetAsteroid[];
  aliens: NetAlien[];
  kills: [number, number];
  deaths: [number, number];
  respawnTimer: [number, number];
  events: GameEvent[];
  tick: number;
}

export interface NetBoss {
  x: number;
  y: number;
  rotation: number;
  hp: number;
  maxHp: number;
  phase: number;
  hitFlash: number;
  entered: boolean;
  targetY: number;
  bossType: "tentacle" | "amigaBall" | "flyingSaucer" | "borgCube";
  tentacles: number;
  shootTimer: number;
  // amigaBall
  bounceVelX?: number;
  bounceVelY?: number;
  rotAngle?: number;
  // flyingSaucer
  tractorBeamActive?: boolean;
  sweepAngle?: number;
  miniSaucers?: { x: number; y: number }[];
  // borgCube
  cubeRotX?: number;
  cubeRotY?: number;
  regenTimer?: number;
  miniCubes?: { x: number; y: number; rotAngle: number }[];
}

export interface NetPowerUp {
  x: number;
  y: number;
  rotation: number;
  type: "shield" | "rapidFire" | "extraLife" | "multiplier";
}

export interface NetPowerUpActive {
  shield: number;
  rapidFire: number;
  multiplier: number;
}

export interface CoopNetState {
  ships: NetShip[];
  bullets: NetBullet[][];
  bossBullets: NetBullet[];
  alienBullets: NetBullet[];
  asteroids: NetAsteroid[];
  aliens: NetAlien[];
  score: number;
  lives: number[];
  eliminated: boolean[];
  wave: number;
  respawnTimer: number[];
  powerUpActive: NetPowerUpActive[];
  hyperspaceCooldown: number[];
  powerUps: NetPowerUp[];
  boss: NetBoss | null;
  waveComplete: boolean;
  gameOver: boolean;
  events: GameEvent[];
  tick: number;
  playerCount: number;
  playerScores?: number[];
  playerAsteroidsDestroyed?: number[];
  playerEnemiesKilled?: number[];
  playerPowerUpsCollected?: number[];
}

export type SessionMode = "duel" | "coop";

export type WorkerInMessage =
  | { type: "init"; turnSpeed?: number }
  | { type: "inputs"; p1: InputState; p2: InputState }
  | { type: "stop" };

export type WorkerOutMessage = { type: "state"; data: DuelNetState };

export type CoopWorkerInMessage =
  | { type: "init"; turnSpeed?: number; playerCount?: number }
  | { type: "inputs"; inputs: InputState[] }
  | { type: "stop" };

export type CoopWorkerOutMessage = { type: "state"; data: CoopNetState };
