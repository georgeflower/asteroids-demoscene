export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  fire: boolean;
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
  type: "brown" | "greenMan";
}

export interface GameEvent {
  type: "explosion" | "kill" | "die_env" | "score_pop";
  x: number;
  y: number;
  color: string;
  count: number;
  player?: number;
  killer?: number;
  points?: number;
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

export interface CoopNetState {
  ship1: NetShip;
  ship2: NetShip;
  bullets1: NetBullet[];
  bullets2: NetBullet[];
  asteroids: NetAsteroid[];
  aliens: NetAlien[];
  score: number;
  lives1: number;
  lives2: number;
  wave: number;
  respawnTimer: [number, number];
  waveComplete: boolean;
  gameOver: boolean;
  events: GameEvent[];
  tick: number;
}

export type SessionMode = "duel" | "coop";

export type WorkerInMessage =
  | { type: "init"; turnSpeed?: number }
  | { type: "inputs"; p1: InputState; p2: InputState }
  | { type: "stop" };

export type WorkerOutMessage = { type: "state"; data: DuelNetState };

export type CoopWorkerInMessage =
  | { type: "init"; turnSpeed?: number }
  | { type: "inputs"; p1: InputState; p2: InputState }
  | { type: "stop" };

export type CoopWorkerOutMessage = { type: "state"; data: CoopNetState };
