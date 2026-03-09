import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { soundEffects } from "@/utils/soundEffects";
import { haptics } from "@/utils/haptics";
import { useMultiplayer } from "@/hooks/useMultiplayer";
import OnlineLobby from "@/components/OnlineLobby";
import CRTBootOverlay from "@/components/CRTBootOverlay";
import type { DuelNetState } from "@/types/multiplayer";

interface Vector {
  x: number;
  y: number;
}

interface GameObject {
  pos: Vector;
  vel: Vector;
  rotation: number;
}

interface Ship extends GameObject {
  rotationSpeed: number;
  thrust: number;
  isThrusting: boolean;
  invulnerable: boolean;
  invulnerableTime: number;
}

interface Asteroid extends GameObject {
  size: "large" | "medium" | "small";
  points: Vector[];
  rotationSpeed: number;
}

interface Bullet extends GameObject {
  lifetime: number;
  isUFO?: boolean;
  isAlien?: boolean;
  color?: string;
  owner?: number; // 1 or 2 for duel mode
}

interface UFO extends GameObject {
  size: "large" | "small";
  shootTimer: number;
  direction: number;
  waveOffset: number;
}

interface PowerUp extends GameObject {
  type: "shield" | "rapidFire" | "extraLife" | "multiplier";
  lifetime: number;
}

interface FloatingText {
  pos: Vector;
  text: string;
  color: string;
  opacity: number;
  lifetime: number;
  maxLifetime: number;
  size: number;
}

interface Particle {
  pos: Vector;
  vel: Vector;
  lifetime: number;
  maxLifetime: number;
  color: string;
  size: number;
}

interface Star {
  x: number;
  y: number;
  brightness: number;
  layer: number;
  size: number;
}

interface Alien extends GameObject {
  type: "brown" | "greenMan";
  hp: number;
  moveTimer: number;
  shootTimer: number;
  zigzagPhase: number;
}

interface Boss extends GameObject {
  hp: number;
  maxHp: number;
  tentacles: number;
  shootTimer: number;
  hitFlash: number;
  phase: number;
  entered: boolean;
  targetY: number;
}

interface ColorTheme {
  name: string;
  ship: string;
  asteroids: string[];
  bg: string;
  accent: string;
  enemy: string;
}

const COLOR_THEMES: ColorTheme[] = [
  { name: "Classic", ship: "#00FFFF", asteroids: ["#FFFFFF", "#88DDFF", "#44AAFF"], bg: "#050510", accent: "#00FF88", enemy: "#FFFF44" },
  { name: "Inferno", ship: "#FF8800", asteroids: ["#FF4444", "#FF8844", "#FFAA22"], bg: "#0A0505", accent: "#FF2200", enemy: "#FFCC00" },
  { name: "Void", ship: "#AA44FF", asteroids: ["#CC88FF", "#8844CC", "#6622AA"], bg: "#080518", accent: "#FF44FF", enemy: "#AA88FF" },
  { name: "Solar", ship: "#FFDD00", asteroids: ["#FFD700", "#FFAA00", "#FF8800"], bg: "#0A0800", accent: "#FFFF44", enemy: "#FFEE66" },
  { name: "Toxic", ship: "#44FF44", asteroids: ["#88FF88", "#44CC44", "#22AA22"], bg: "#030A03", accent: "#00FF00", enemy: "#AAFF44" },
];

interface GameState {
  ship: Ship;
  asteroids: Asteroid[];
  bullets: Bullet[];
  ufos: UFO[];
  powerUps: PowerUp[];
  score: number;
  lives: number;
  wave: number;
  gameOver: boolean;
  paused: boolean;
  powerUpActive: {
    shield: number;
    rapidFire: number;
    multiplier: number;
  };
  floatingTexts: FloatingText[];
  particles: Particle[];
  stars: Star[];
  ufoSpawnTimer: number;
  aliens: Alien[];
  boss: Boss | null;
  alienSpawnTimer: number;
  bossDefeated: boolean;
}

interface DuelState {
  ship1: Ship;
  ship2: Ship;
  bullets1: Bullet[];
  bullets2: Bullet[];
  asteroids: Asteroid[];
  aliens: Alien[];
  kills: [number, number];
  deaths: [number, number];
  respawnTimer: [number, number];
  floatingTexts: FloatingText[];
  particles: Particle[];
  stars: Star[];
  alienSpawnTimer: number;
  asteroidSpawnTimer: number;
}

type GameMode = "menu" | "solo" | "duel" | "online_lobby" | "online";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const SHIP_SIZE = 10;
const BULLET_SPEED = 7;
const BULLET_LIFETIME = 60;
const ASTEROID_SPEEDS = { large: 0.5, medium: 0.8, small: 1.2 };
const ASTEROID_POINTS = { large: 20, medium: 50, small: 100 };
const UFO_POINTS = { large: 200, small: 1000 };
const GAMEPAD_DEADZONE = 0.2;
const MARQUEE_SPEED = 0.8; // pixels per frame (~48px/sec at 60fps)

const P1_COLOR = "#00FFFF";
const P2_COLOR = "#FF8844";

const getTheme = (wave: number): ColorTheme => {
  const idx = Math.floor((wave - 1) / 5) % COLOR_THEMES.length;
  return COLOR_THEMES[idx];
};

const getSpeedScale = (wave: number): number => 1 + wave * 0.05;

const Game = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const duelStateRef = useRef<DuelState | null>(null);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const animationFrameRef = useRef<number>();
  const lastShotRef = useRef(0);
  const lastShotP2Ref = useRef(0);
  const enteringInitialsRef = useRef(false);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(3);
  const [displayWave, setDisplayWave] = useState(1);
  const [showGameOver, setShowGameOver] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [enteringInitials, setEnteringInitials] = useState(false);
  const [initials, setInitials] = useState("");
  const [leaderboard, setLeaderboard] = useState<{initials: string; score: number; date: string}[]>([]);
  const [showLifeLost, setShowLifeLost] = useState(false);
  const showLifeLostRef = useRef(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<{ artist: string; title: string } | null>(null);
  const nowPlayingRef = useRef<{ artist: string; title: string } | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>("menu");
  const gameModeRef = useRef<GameMode>("menu");
  const [showBootAnimation, setShowBootAnimation] = useState(true);
  const [duelKills, setDuelKills] = useState<[number, number]>([0, 0]);
  const [duelDeaths, setDuelDeaths] = useState<[number, number]>([0, 0]);
  const [menuSelection, setMenuSelection] = useState(0); // 0=solo, 1=duel, 2=online
  const [gameOverSelection, setGameOverSelection] = useState(0); // 0=play again, 1=menu
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [pauseSelection, setPauseSelection] = useState(0); // 0=resume, 1=quit
  const prevGamepadButtonRef = useRef<boolean[]>([false, false, false, false, false, false, false]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [autoPlayMusic, setAutoPlayMusic] = useState(() => {
    const stored = localStorage.getItem("autoPlayMusic");
    return stored === null ? true : stored === "true";
  });
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const radioStartedRef = useRef(false);
  const onelinerRef = useRef<{ author: string; message: string } | null>(null);
  const lastOnelinerTimeRef = useRef<string>("");
  const nowPlayingMarqueeXRef = useRef<number>(CANVAS_WIDTH);
  const onelinerMarqueeXRef = useRef<number>(CANVAS_WIDTH);

  // Online multiplayer state
  const multiplayer = useMultiplayer();
  const workerRef = useRef<Worker | null>(null);
  const broadcastTickRef = useRef(0);
  const isHostRef = useRef(false);
  const isConnectedRef = useRef(false);

  // Keep ref in sync
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);

  const loadLeaderboard = useCallback(async () => {
    const { data, error } = await supabase
      .from('high_scores')
      .select('initials, score, created_at')
      .order('score', { ascending: false })
      .limit(10);
    if (!error && data) {
      return data.map((row) => ({
        initials: row.initials,
        score: row.score,
        date: new Date(row.created_at).toLocaleDateString(),
      }));
    }
    return [];
  }, []);

  const saveToLeaderboard = useCallback(async (playerInitials: string, score: number) => {
    const { error } = await supabase
      .from('high_scores')
      .insert({ initials: playerInitials.toUpperCase(), score });
    if (error) {
      toast.error('Failed to save score online');
      return;
    }
    const board = await loadLeaderboard();
    setLeaderboard(board);
  }, [loadLeaderboard]);

  const isHighScore = useCallback((score: number) => {
    return leaderboard.length < 10 || score > (leaderboard[leaderboard.length - 1]?.score ?? 0);
  }, [leaderboard]);

  useEffect(() => {
    loadLeaderboard().then(setLeaderboard);
  }, [loadLeaderboard]);

  const createStars = (): Star[] => {
    const stars: Star[] = [];
    for (let i = 0; i < 120; i++) {
      const layer = Math.floor(Math.random() * 3);
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        brightness: 0.3 + Math.random() * 0.7,
        layer,
        size: layer === 0 ? 0.5 : layer === 1 ? 1 : 1.5,
      });
    }
    return stars;
  };

  const spawnFloatingTextTo = (arr: FloatingText[], pos: Vector, text: string, color: string, size = 16) => {
    arr.push({
      pos: { x: pos.x, y: pos.y },
      text,
      color,
      opacity: 1,
      lifetime: 90,
      maxLifetime: 90,
      size,
    });
  };

  const spawnFloatingText = (pos: Vector, text: string, color: string, size = 16) => {
    if (gameModeRef.current === "duel" && duelStateRef.current) {
      spawnFloatingTextTo(duelStateRef.current.floatingTexts, pos, text, color, size);
    } else if (gameStateRef.current) {
      spawnFloatingTextTo(gameStateRef.current.floatingTexts, pos, text, color, size);
    }
  };

  const spawnExplosionTo = (arr: Particle[], pos: Vector, color: string, count = 12) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 1 + Math.random() * 3;
      arr.push({
        pos: { x: pos.x, y: pos.y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        lifetime: 30 + Math.random() * 30,
        maxLifetime: 60,
        color,
        size: 1 + Math.random() * 2,
      });
    }
  };

  const spawnExplosion = (pos: Vector, color: string, count = 12) => {
    if (gameModeRef.current === "duel" && duelStateRef.current) {
      spawnExplosionTo(duelStateRef.current.particles, pos, color, count);
    } else if (gameStateRef.current) {
      spawnExplosionTo(gameStateRef.current.particles, pos, color, count);
    }
  };

  const spawnThrustParticle = (ship: Ship, particles: Particle[]) => {
    const backAngle = ship.rotation + Math.PI;
    const spread = (Math.random() - 0.5) * 0.6;
    particles.push({
      pos: {
        x: ship.pos.x + Math.cos(backAngle) * SHIP_SIZE * 0.5,
        y: ship.pos.y + Math.sin(backAngle) * SHIP_SIZE * 0.5,
      },
      vel: {
        x: Math.cos(backAngle + spread) * (1.5 + Math.random() * 2) + ship.vel.x * 0.3,
        y: Math.sin(backAngle + spread) * (1.5 + Math.random() * 2) + ship.vel.y * 0.3,
      },
      lifetime: 15 + Math.random() * 15,
      maxLifetime: 30,
      color: Math.random() > 0.5 ? "#FF6622" : "#FFAA22",
      size: 1 + Math.random() * 1.5,
    });
  };

  const createShip = (x?: number, y?: number): Ship => ({
    pos: { x: x ?? CANVAS_WIDTH / 2, y: y ?? CANVAS_HEIGHT / 2 },
    vel: { x: 0, y: 0 },
    rotation: -Math.PI / 2,
    rotationSpeed: 0.05,
    thrust: 0.08,
    isThrusting: false,
    invulnerable: true,
    invulnerableTime: 120,
  });

  const createAsteroid = (x: number, y: number, size: "large" | "medium" | "small", wave = 1): Asteroid => {
    const points: Vector[] = [];
    const numPoints = 8 + Math.floor(Math.random() * 4);
    const baseRadius = size === "large" ? 40 : size === "medium" ? 25 : 12;

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const radius = baseRadius + (Math.random() - 0.5) * baseRadius * 0.4;
      points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }

    const angle = Math.random() * Math.PI * 2;
    const variance = size === "large" ? (0.3 + Math.random() * 1.2) : (0.8 + Math.random() * 0.4);
    const speed = ASTEROID_SPEEDS[size] * variance * getSpeedScale(wave);

    return {
      pos: { x, y },
      vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      rotation: Math.random() * Math.PI * 2,
      size,
      points,
      rotationSpeed: (Math.random() - 0.5) * 0.04,
    };
  };

  const createUFO = (size: "large" | "small"): UFO => {
    const side = Math.random() < 0.5 ? 0 : CANVAS_WIDTH;
    return {
      pos: { x: side, y: 50 + Math.random() * (CANVAS_HEIGHT - 100) },
      vel: { x: (side === 0 ? 1 : -1) * (1.0 + Math.random() * 0.5), y: 0 },
      rotation: 0,
      size,
      shootTimer: 60 + Math.random() * 60,
      direction: side === 0 ? 1 : -1,
      waveOffset: Math.random() * Math.PI * 2,
    };
  };

  const createAlien = (type: "brown" | "greenMan", wave: number): Alien => {
    const side = Math.random() < 0.5 ? -20 : CANVAS_WIDTH + 20;
    const speed = type === "brown" ? (2 + Math.random() * 1.5) * getSpeedScale(wave) : (0.8 + Math.random() * 0.4) * getSpeedScale(wave);
    const dir = side < 0 ? 1 : -1;
    return {
      pos: { x: side, y: 30 + Math.random() * (CANVAS_HEIGHT - 60) },
      vel: { x: dir * speed, y: (Math.random() - 0.5) * speed * 0.5 },
      rotation: 0,
      type,
      hp: type === "brown" ? 1 : 2,
      moveTimer: 0,
      shootTimer: type === "greenMan" ? 90 + Math.random() * 60 : 9999,
      zigzagPhase: Math.random() * Math.PI * 2,
    };
  };

  const createBoss = (wave: number): Boss => {
    return {
      pos: { x: CANVAS_WIDTH / 2, y: -80 },
      vel: { x: 0, y: 1 },
      rotation: 0,
      hp: 3 + wave,
      maxHp: 3 + wave,
      tentacles: Math.min(4 + Math.floor(wave / 5), 8),
      shootTimer: 120,
      hitFlash: 0,
      phase: 0,
      entered: false,
      targetY: 100 + Math.random() * 60,
    };
  };

  const createPowerUp = (x: number, y: number): PowerUp | null => {
    if (Math.random() > 0.15) return null;
    const types: PowerUp["type"][] = ["shield", "rapidFire", "extraLife", "multiplier"];
    const type = types[Math.floor(Math.random() * types.length)];
    return {
      pos: { x, y },
      vel: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 },
      rotation: 0,
      type,
      lifetime: 300,
    };
  };

  // ===== Gamepad helpers =====
  const readGamepad = (index: number): { left: boolean; right: boolean; up: boolean; fire: boolean; hyperspace: boolean } => {
    const result = { left: false, right: false, up: false, fire: false, hyperspace: false };
    try {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[index];
      if (!gp) return result;
      // Axes
      if (gp.axes[0] < -GAMEPAD_DEADZONE) result.left = true;
      if (gp.axes[0] > GAMEPAD_DEADZONE) result.right = true;
      if (gp.axes[1] < -GAMEPAD_DEADZONE) result.up = true;
      // D-pad (buttons 12-15 on standard layout)
      if (gp.buttons[14]?.pressed) result.left = true;
      if (gp.buttons[15]?.pressed) result.right = true;
      if (gp.buttons[12]?.pressed) result.up = true;
      // Fire = button 0 (A/X), Hyperspace = button 1 (B/Circle)
      if (gp.buttons[0]?.pressed) result.fire = true;
      if (gp.buttons[1]?.pressed) result.hyperspace = true;
      // X button (button 2) = also thrust
      if (gp.buttons[2]?.pressed) result.up = true;
    } catch { /* no gamepad API */ }
    return result;
  };

  const initGame = useCallback(() => {
    const asteroids: Asteroid[] = [];
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * CANVAS_WIDTH;
      const y = Math.random() * CANVAS_HEIGHT;
      const dist = Math.hypot(x - CANVAS_WIDTH / 2, y - CANVAS_HEIGHT / 2);
      if (dist > 100) {
        asteroids.push(createAsteroid(x, y, "large", 1));
      } else {
        i--;
      }
    }

    gameStateRef.current = {
      ship: createShip(),
      asteroids,
      bullets: [],
      ufos: [],
      powerUps: [],
      score: 0,
      lives: 3,
      wave: 1,
      gameOver: false,
      paused: false,
      powerUpActive: { shield: 0, rapidFire: 0, multiplier: 0 },
      floatingTexts: [],
      particles: [],
      stars: createStars(),
      ufoSpawnTimer: 900 + Math.random() * 600,
      aliens: [],
      boss: null,
      alienSpawnTimer: 600,
      bossDefeated: false,
    };

    duelStateRef.current = null;
    setDisplayScore(0);
    setDisplayLives(3);
    setDisplayWave(1);
    setShowGameOver(false);
    setEnteringInitials(false);
    setInitials("");
    setShowLeaderboard(false);
    setShowLifeLost(false);
    showLifeLostRef.current = false;
    setGameMode("solo");
    toast.success("Game Started! Use Arrow Keys to move, Space to shoot");
    // Focus canvas for input capture
    setTimeout(() => { canvasRef.current?.focus(); }, 50);
  }, []);

  const initDuel = useCallback(() => {
    const asteroids: Asteroid[] = [];
    for (let i = 0; i < 3; i++) {
      let x: number, y: number;
      do {
        x = Math.random() * CANVAS_WIDTH;
        y = Math.random() * CANVAS_HEIGHT;
      } while (
        Math.hypot(x - CANVAS_WIDTH * 0.25, y - CANVAS_HEIGHT / 2) < 100 ||
        Math.hypot(x - CANVAS_WIDTH * 0.75, y - CANVAS_HEIGHT / 2) < 100
      );
      asteroids.push(createAsteroid(x, y, "large", 1));
    }

    duelStateRef.current = {
      ship1: createShip(CANVAS_WIDTH * 0.25, CANVAS_HEIGHT / 2),
      ship2: createShip(CANVAS_WIDTH * 0.75, CANVAS_HEIGHT / 2),
      bullets1: [],
      bullets2: [],
      asteroids,
      aliens: [],
      kills: [0, 0],
      deaths: [0, 0],
      respawnTimer: [0, 0],
      floatingTexts: [],
      particles: [],
      stars: createStars(),
      alienSpawnTimer: 800,
      asteroidSpawnTimer: 600,
    };
    // Point ships at each other
    duelStateRef.current.ship1.rotation = 0;
    duelStateRef.current.ship2.rotation = Math.PI;

    gameStateRef.current = null;
    setShowGameOver(false);
    setShowLifeLost(false);
    showLifeLostRef.current = false;
    setDuelKills([0, 0]);
    setDuelDeaths([0, 0]);
    setGameMode("duel");
    toast.success("DUEL MODE! P1: Arrows+Space | P2: WASD+E");
    setTimeout(() => { canvasRef.current?.focus(); }, 50);
  }, []);

  // ===== ONLINE HELPERS =====
  const applyNetState = useCallback((net: DuelNetState) => {
    const ds = duelStateRef.current;
    if (!ds) return;

    ds.ship1.pos = { x: net.ship1.x, y: net.ship1.y };
    ds.ship1.vel = { x: net.ship1.vx, y: net.ship1.vy };
    ds.ship1.rotation = net.ship1.rot;
    ds.ship1.isThrusting = net.ship1.thrust;
    ds.ship1.invulnerable = net.ship1.invuln;
    ds.ship1.invulnerableTime = net.ship1.invulnTime;

    ds.ship2.pos = { x: net.ship2.x, y: net.ship2.y };
    ds.ship2.vel = { x: net.ship2.vx, y: net.ship2.vy };
    ds.ship2.rotation = net.ship2.rot;
    ds.ship2.isThrusting = net.ship2.thrust;
    ds.ship2.invulnerable = net.ship2.invuln;
    ds.ship2.invulnerableTime = net.ship2.invulnTime;

    ds.bullets1 = net.bullets1.map(b => ({
      pos: { x: b.x, y: b.y }, vel: { x: b.vx, y: b.vy },
      rotation: b.rot, lifetime: b.lifetime, owner: b.owner,
    }));
    ds.bullets2 = net.bullets2.map(b => ({
      pos: { x: b.x, y: b.y }, vel: { x: b.vx, y: b.vy },
      rotation: b.rot, lifetime: b.lifetime, owner: b.owner,
    }));

    ds.asteroids = net.asteroids.map(a => {
      const pts: Vector[] = [];
      for (let j = 0; j < a.points.length; j += 2) {
        pts.push({ x: a.points[j], y: a.points[j + 1] });
      }
      return {
        pos: { x: a.x, y: a.y }, vel: { x: a.vx, y: a.vy },
        rotation: a.rot, size: a.size as "large" | "medium" | "small",
        rotationSpeed: a.rotSpeed, points: pts,
      };
    });

    ds.aliens = net.aliens.map(a => ({
      pos: { x: a.x, y: a.y }, vel: { x: a.vx, y: a.vy },
      rotation: 0, type: a.type as "brown" | "greenMan",
      hp: 1, moveTimer: 0, shootTimer: 999, zigzagPhase: 0,
    }));

    const prevK0 = ds.kills[0], prevK1 = ds.kills[1];
    ds.kills = net.kills;
    ds.deaths = net.deaths;
    ds.respawnTimer = net.respawnTimer;

    for (const event of net.events) {
      if (event.type === "explosion" || event.type === "kill" || event.type === "die_env") {
        spawnExplosionTo(ds.particles, { x: event.x, y: event.y }, event.color, event.count);
        soundEffects.explode();
      }
      if (event.type === "kill" && event.killer !== undefined) {
        const color = event.killer === 0 ? P1_COLOR : P2_COLOR;
        spawnFloatingTextTo(ds.floatingTexts, { x: event.x, y: event.y }, `P${event.killer + 1} KILL!`, color, 20);
      }
    }

    if (net.kills[0] !== prevK0 || net.kills[1] !== prevK1) {
      setDuelKills([...net.kills]);
      setDuelDeaths([...net.deaths]);
    }
  }, []);

  const updateOnlineVisuals = useCallback(() => {
    const ds = duelStateRef.current;
    if (!ds) return;
    ds.floatingTexts = ds.floatingTexts.filter((ft) => {
      ft.pos.y -= 0.5; ft.lifetime--;
      ft.opacity = ft.lifetime / ft.maxLifetime;
      return ft.lifetime > 0;
    });
    ds.particles = ds.particles.filter((p) => {
      p.pos.x += p.vel.x; p.pos.y += p.vel.y;
      p.vel.x *= 0.97; p.vel.y *= 0.97;
      p.lifetime--;
      return p.lifetime > 0;
    });
  }, []);

  const initOnline = useCallback((isHost: boolean) => {
    duelStateRef.current = {
      ship1: createShip(CANVAS_WIDTH * 0.25, CANVAS_HEIGHT / 2),
      ship2: createShip(CANVAS_WIDTH * 0.75, CANVAS_HEIGHT / 2),
      bullets1: [], bullets2: [], asteroids: [], aliens: [],
      kills: [0, 0], deaths: [0, 0], respawnTimer: [0, 0],
      floatingTexts: [], particles: [], stars: createStars(),
      alienSpawnTimer: 800, asteroidSpawnTimer: 600,
    };
    duelStateRef.current.ship1.rotation = 0;
    duelStateRef.current.ship2.rotation = Math.PI;
    gameStateRef.current = null;
    setShowGameOver(false); setShowLifeLost(false);
    showLifeLostRef.current = false;
    setDuelKills([0, 0]); setDuelDeaths([0, 0]);
    setGameMode("online");
    broadcastTickRef.current = 0;

    if (isHost) {
      const worker = new Worker(new URL('../workers/gameWorker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.postMessage({ type: 'init' });
    }
    toast.success(isHost ? "Game started! You are HOST (P1)" : "Game started! You are GUEST (P2)");
  }, []);

  const nextWave = useCallback(() => {
    if (!gameStateRef.current) return;
    const state = gameStateRef.current;

    state.wave++;
    const isBossWave = state.wave % 5 === 0;

    if (isBossWave && !state.bossDefeated) {
      state.boss = createBoss(state.wave);
      state.asteroids = [];
      state.aliens = [];
      state.ship = createShip();
      setDisplayWave(state.wave);

      const theme = getTheme(state.wave);
      spawnFloatingText(
        { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 - 40 },
        `WAVE ${state.wave}`,
        theme.ship,
        28
      );
      spawnFloatingText(
        { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 + 10 },
        "⚠ BOSS INCOMING ⚠",
        "#FF4444",
        22
      );
      toast.success(`Wave ${state.wave} — BOSS FIGHT!`);
      return;
    }

    state.bossDefeated = false;
    const numAsteroids = Math.min(4 + state.wave * 2, 20);
    const asteroids: Asteroid[] = [];

    for (let i = 0; i < numAsteroids; i++) {
      const x = Math.random() * CANVAS_WIDTH;
      const y = Math.random() * CANVAS_HEIGHT;
      const dist = Math.hypot(x - CANVAS_WIDTH / 2, y - CANVAS_HEIGHT / 2);
      if (dist > 150) {
        asteroids.push(createAsteroid(x, y, "large", state.wave));
      } else {
        i--;
      }
    }

    state.asteroids = asteroids;
    state.ship = createShip();
    state.alienSpawnTimer = Math.max(300, 600 - state.wave * 20);
    setDisplayWave(state.wave);

    const theme = getTheme(state.wave);
    spawnFloatingText(
      { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      `WAVE ${state.wave}`,
      theme.ship,
      28
    );

    if ((state.wave - 1) % 5 === 0 && state.wave > 1) {
      spawnFloatingText(
        { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 + 35 },
        `${theme.name.toUpperCase()} ZONE`,
        theme.accent,
        18
      );
    }

    toast.success(`Wave ${state.wave}!`);
  }, []);

  const wrapPosition = (pos: Vector): Vector => {
    return {
      x: ((pos.x % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH,
      y: ((pos.y % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT,
    };
  };

  const wrapAsteroidPosition = (asteroid: Asteroid, shipPos: Vector): void => {
    const oldX = asteroid.pos.x;
    const oldY = asteroid.pos.y;
    asteroid.pos = wrapPosition(asteroid.pos);

    const wrapped = Math.abs(asteroid.pos.x - oldX) > CANVAS_WIDTH * 0.5 ||
                    Math.abs(asteroid.pos.y - oldY) > CANVAS_HEIGHT * 0.5;

    if (wrapped) {
      const toShipAngle = Math.atan2(shipPos.y - asteroid.pos.y, shipPos.x - asteroid.pos.x);
      const currentAngle = Math.atan2(asteroid.vel.y, asteroid.vel.x);
      const speed = Math.hypot(asteroid.vel.x, asteroid.vel.y);

      let angleDiff = toShipAngle - currentAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const nudge = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.14);
      const newAngle = currentAngle + nudge;
      asteroid.vel.x = Math.cos(newAngle) * speed;
      asteroid.vel.y = Math.sin(newAngle) * speed;
    }
  };

  const checkCollision = (pos1: Vector, radius1: number, pos2: Vector, radius2: number): boolean => {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy) < radius1 + radius2;
  };

  const loseLife = useCallback((state: GameState) => {
    spawnExplosion(state.ship.pos, "#FFFFFF", 20);
    state.lives--;
    setDisplayLives(state.lives);
    state.ship = createShip();
    soundEffects.explode();
    soundEffects.stopThrust();
    haptics.heavy();

    if (state.lives <= 0) {
      state.gameOver = true;
      setShowGameOver(true);
      if (isHighScore(state.score)) setEnteringInitials(true);
      loadLeaderboard().then(setLeaderboard);
      toast.error(`Game Over! Final Score: ${state.score}`);
      haptics.gameOver();
    } else {
      showLifeLostRef.current = true;
      setShowLifeLost(true);
    }
  }, [isHighScore, loadLeaderboard]);

  const shootBullet = useCallback(() => {
    if (gameModeRef.current === "solo") {
      if (!gameStateRef.current || gameStateRef.current.gameOver) return;
      const now = Date.now();
      const fireRate = gameStateRef.current.powerUpActive.rapidFire > 0 ? 100 : 250;
      if (now - lastShotRef.current < fireRate) return;
      lastShotRef.current = now;

      const { ship } = gameStateRef.current;
      gameStateRef.current.bullets.push({
        pos: { ...ship.pos },
        vel: {
          x: Math.cos(ship.rotation) * BULLET_SPEED + ship.vel.x,
          y: Math.sin(ship.rotation) * BULLET_SPEED + ship.vel.y,
        },
        rotation: ship.rotation,
        lifetime: BULLET_LIFETIME,
      });
      soundEffects.shoot();
      haptics.light();
    }
  }, []);

  const shootBulletDuel = useCallback((player: 1 | 2) => {
    if (!duelStateRef.current) return;
    const ds = duelStateRef.current;
    const now = Date.now();
    const ref = player === 1 ? lastShotRef : lastShotP2Ref;
    if (now - ref.current < 250) return;
    ref.current = now;

    const ship = player === 1 ? ds.ship1 : ds.ship2;
    if (ship.invulnerableTime > 60) return; // don't shoot while freshly respawning
    const bullets = player === 1 ? ds.bullets1 : ds.bullets2;
    bullets.push({
      pos: { ...ship.pos },
      vel: {
        x: Math.cos(ship.rotation) * BULLET_SPEED + ship.vel.x,
        y: Math.sin(ship.rotation) * BULLET_SPEED + ship.vel.y,
      },
      rotation: ship.rotation,
      lifetime: BULLET_LIFETIME,
      owner: player,
    });
    soundEffects.shoot();
  }, []);

  const hyperspace = useCallback(() => {
    if (!gameStateRef.current || gameStateRef.current.gameOver) return;

    gameStateRef.current.ship.pos = {
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
    };
    gameStateRef.current.ship.vel = { x: 0, y: 0 };

    if (Math.random() < 0.1) {
      loseLife(gameStateRef.current);
      toast.error("Hyperspace malfunction!");
    } else {
      toast.info("Hyperspace jump!");
    }
  }, [loseLife]);

  // ===== Ship update helper =====
  const updateShipMovement = (ship: Ship, left: boolean, right: boolean, up: boolean, particles: Particle[]) => {
    if (left) ship.rotation -= ship.rotationSpeed;
    if (right) ship.rotation += ship.rotationSpeed;
    if (up) {
      ship.isThrusting = true;
      ship.vel.x += Math.cos(ship.rotation) * ship.thrust;
      ship.vel.y += Math.sin(ship.rotation) * ship.thrust;
      if (Math.random() > 0.3) spawnThrustParticle(ship, particles);
    } else {
      ship.isThrusting = false;
    }

    const maxSpeed = 8;
    const speed = Math.hypot(ship.vel.x, ship.vel.y);
    if (speed > maxSpeed) {
      ship.vel.x = (ship.vel.x / speed) * maxSpeed;
      ship.vel.y = (ship.vel.y / speed) * maxSpeed;
    }

    ship.vel.x *= 0.99;
    ship.vel.y *= 0.99;
    ship.pos.x += ship.vel.x;
    ship.pos.y += ship.vel.y;
    ship.pos = wrapPosition(ship.pos);

    if (ship.invulnerableTime > 0) {
      ship.invulnerableTime--;
      if (ship.invulnerableTime === 0) ship.invulnerable = false;
    }
  };

  // ===== DUEL UPDATE =====
  const updateDuel = useCallback(() => {
    if (isPausedRef.current) return;
    const ds = duelStateRef.current;
    if (!ds) return;

    const keys = keysRef.current;
    const gp0 = readGamepad(0);
    const gp1 = readGamepad(1);

    // P1: Arrow keys or gamepad 0
    const p1Left = keys["ArrowLeft"] || gp0.left;
    const p1Right = keys["ArrowRight"] || gp0.right;
    const p1Up = keys["ArrowUp"] || gp0.up;
    const p1Fire = keys[" "] || gp0.fire;

    // P2: WASD or gamepad 1
    const p2Left = keys["a"] || keys["A"] || gp1.left;
    const p2Right = keys["d"] || keys["D"] || gp1.right;
    const p2Up = keys["w"] || keys["W"] || gp1.up;
    const p2Fire = keys["e"] || keys["E"] || gp1.fire;

    // Handle respawn timers
    for (let p = 0; p < 2; p++) {
      if (ds.respawnTimer[p] > 0) {
        ds.respawnTimer[p]--;
        if (ds.respawnTimer[p] === 0) {
          const ship = p === 0 ? ds.ship1 : ds.ship2;
          ship.pos = { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT };
          ship.vel = { x: 0, y: 0 };
          ship.invulnerable = true;
          ship.invulnerableTime = 120;
        }
      }
    }

    // Update ships
    if (ds.respawnTimer[0] === 0) updateShipMovement(ds.ship1, p1Left, p1Right, p1Up, ds.particles);
    if (ds.respawnTimer[1] === 0) updateShipMovement(ds.ship2, p2Left, p2Right, p2Up, ds.particles);

    // Firing
    if (p1Fire && ds.respawnTimer[0] === 0) shootBulletDuel(1);
    if (p2Fire && ds.respawnTimer[1] === 0) shootBulletDuel(2);

    // Update bullets
    const updateBullets = (bullets: Bullet[]) => bullets.filter((b) => {
      b.pos.x += b.vel.x;
      b.pos.y += b.vel.y;
      b.pos = wrapPosition(b.pos);
      b.lifetime--;
      return b.lifetime > 0;
    });
    ds.bullets1 = updateBullets(ds.bullets1);
    ds.bullets2 = updateBullets(ds.bullets2);

    // Update asteroids (no homing in duel — just wrap)
    ds.asteroids.forEach((asteroid) => {
      asteroid.pos.x += asteroid.vel.x;
      asteroid.pos.y += asteroid.vel.y;
      asteroid.pos = wrapPosition(asteroid.pos);
      asteroid.rotation += asteroid.rotationSpeed;
    });

    // Spawn new asteroids periodically
    ds.asteroidSpawnTimer--;
    if (ds.asteroidSpawnTimer <= 0 && ds.asteroids.length < 6) {
      const edge = Math.random();
      let x: number, y: number;
      if (edge < 0.25) { x = 0; y = Math.random() * CANVAS_HEIGHT; }
      else if (edge < 0.5) { x = CANVAS_WIDTH; y = Math.random() * CANVAS_HEIGHT; }
      else if (edge < 0.75) { x = Math.random() * CANVAS_WIDTH; y = 0; }
      else { x = Math.random() * CANVAS_WIDTH; y = CANVAS_HEIGHT; }
      ds.asteroids.push(createAsteroid(x, y, "large", 1));
      ds.asteroidSpawnTimer = 500 + Math.random() * 400;
    }

    // Spawn aliens occasionally
    ds.alienSpawnTimer--;
    if (ds.alienSpawnTimer <= 0 && ds.aliens.length < 2) {
      ds.aliens.push(createAlien(Math.random() < 0.7 ? "brown" : "greenMan", 3));
      ds.alienSpawnTimer = 600 + Math.random() * 400;
    }

    // Update aliens (move toward center-ish, no specific target)
    ds.aliens = ds.aliens.filter((alien) => {
      alien.moveTimer++;
      alien.zigzagPhase += 0.05;
      alien.pos.x += alien.vel.x;
      alien.pos.y += alien.vel.y;
      if (alien.pos.x < -60 || alien.pos.x > CANVAS_WIDTH + 60) {
        if (alien.moveTimer > 120) return false;
      }
      if (alien.pos.y < 0) alien.pos.y = CANVAS_HEIGHT;
      if (alien.pos.y > CANVAS_HEIGHT) alien.pos.y = 0;
      return true;
    });

    // ===== Collisions =====
    const killPlayer = (playerIdx: 0 | 1, killerIdx: 0 | 1) => {
      const ship = playerIdx === 0 ? ds.ship1 : ds.ship2;
      spawnExplosionTo(ds.particles, ship.pos, playerIdx === 0 ? P1_COLOR : P2_COLOR, 20);
      soundEffects.explode();
      ds.deaths[playerIdx]++;
      ds.kills[killerIdx]++;
      ds.respawnTimer[playerIdx] = 120; // 2 seconds
      ship.pos = { x: -100, y: -100 }; // off screen
      ship.vel = { x: 0, y: 0 };
      ship.invulnerable = true;
      ship.invulnerableTime = 999;
      setDuelKills([...ds.kills]);
      setDuelDeaths([...ds.deaths]);
      spawnFloatingTextTo(ds.floatingTexts, ship.pos, `P${killerIdx + 1} KILL!`, killerIdx === 0 ? P1_COLOR : P2_COLOR, 20);
    };

    const dieToEnvironment = (playerIdx: 0 | 1) => {
      const ship = playerIdx === 0 ? ds.ship1 : ds.ship2;
      spawnExplosionTo(ds.particles, ship.pos, playerIdx === 0 ? P1_COLOR : P2_COLOR, 20);
      soundEffects.explode();
      ds.deaths[playerIdx]++;
      ds.respawnTimer[playerIdx] = 120;
      ship.pos = { x: -100, y: -100 };
      ship.vel = { x: 0, y: 0 };
      ship.invulnerable = true;
      ship.invulnerableTime = 999;
      setDuelDeaths([...ds.deaths]);
    };

    // P1 bullets vs P2 ship
    if (!ds.ship2.invulnerable && ds.respawnTimer[1] === 0) {
      ds.bullets1 = ds.bullets1.filter((b) => {
        if (checkCollision(b.pos, 2, ds.ship2.pos, SHIP_SIZE)) {
          killPlayer(1, 0);
          return false;
        }
        return true;
      });
    }

    // P2 bullets vs P1 ship
    if (!ds.ship1.invulnerable && ds.respawnTimer[0] === 0) {
      ds.bullets2 = ds.bullets2.filter((b) => {
        if (checkCollision(b.pos, 2, ds.ship1.pos, SHIP_SIZE)) {
          killPlayer(0, 1);
          return false;
        }
        return true;
      });
    }

    // Bullets vs asteroids (both players)
    const newAsteroids: Asteroid[] = [];
    const bulletVsAsteroids = (bullets: Bullet[]) => {
      return bullets.filter((bullet) => {
        let alive = true;
        ds.asteroids = ds.asteroids.filter((asteroid) => {
          const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
          if (checkCollision(bullet.pos, 2, asteroid.pos, radius)) {
            alive = false;
            spawnExplosionTo(ds.particles, asteroid.pos, "#FFFFFF", 8);
            if (asteroid.size === "large") {
              newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium", 1));
              newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium", 1));
            } else if (asteroid.size === "medium") {
              newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small", 1));
              newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small", 1));
            }
            return false;
          }
          return true;
        });
        return alive;
      });
    };
    ds.bullets1 = bulletVsAsteroids(ds.bullets1);
    ds.bullets2 = bulletVsAsteroids(ds.bullets2);
    ds.asteroids.push(...newAsteroids);

    // Bullets vs aliens
    const bulletVsAliens = (bullets: Bullet[]) => {
      return bullets.filter((bullet) => {
        let alive = true;
        ds.aliens = ds.aliens.filter((alien) => {
          if (checkCollision(bullet.pos, 2, alien.pos, 12)) {
            alive = false;
            alien.hp--;
            if (alien.hp <= 0) {
              spawnExplosionTo(ds.particles, alien.pos, "#AA6633", 10);
              return false;
            }
          }
          return true;
        });
        return alive;
      });
    };
    ds.bullets1 = bulletVsAliens(ds.bullets1);
    ds.bullets2 = bulletVsAliens(ds.bullets2);

    // Ships vs asteroids
    for (let p = 0; p < 2; p++) {
      const ship = p === 0 ? ds.ship1 : ds.ship2;
      if (ship.invulnerable || ds.respawnTimer[p] > 0) continue;
      for (const asteroid of ds.asteroids) {
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        if (checkCollision(ship.pos, SHIP_SIZE, asteroid.pos, radius)) {
          dieToEnvironment(p as 0 | 1);
          break;
        }
      }
    }

    // Ships vs aliens
    for (let p = 0; p < 2; p++) {
      const ship = p === 0 ? ds.ship1 : ds.ship2;
      if (ship.invulnerable || ds.respawnTimer[p] > 0) continue;
      for (const alien of ds.aliens) {
        if (checkCollision(ship.pos, SHIP_SIZE, alien.pos, 12)) {
          dieToEnvironment(p as 0 | 1);
          break;
        }
      }
    }

    // Update floating texts & particles
    ds.floatingTexts = ds.floatingTexts.filter((ft) => {
      ft.pos.y -= 0.5;
      ft.lifetime--;
      ft.opacity = ft.lifetime / ft.maxLifetime;
      return ft.lifetime > 0;
    });
    ds.particles = ds.particles.filter((p) => {
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.vel.x *= 0.97;
      p.vel.y *= 0.97;
      p.lifetime--;
      return p.lifetime > 0;
    });
  }, [shootBulletDuel]);

  // ===== SOLO UPDATE (original) =====
  const update = useCallback(() => {
    if (isPausedRef.current) return;
    if (!gameStateRef.current || gameStateRef.current.gameOver || gameStateRef.current.paused || showLifeLostRef.current) return;

    const state = gameStateRef.current;
    const theme = getTheme(state.wave);
    const gp0 = readGamepad(0);

    // Update ship — keyboard OR gamepad
    const p1Left = keysRef.current["ArrowLeft"] || gp0.left;
    const p1Right = keysRef.current["ArrowRight"] || gp0.right;
    const p1Up = keysRef.current["ArrowUp"] || gp0.up;

    if (p1Left) state.ship.rotation -= state.ship.rotationSpeed;
    if (p1Right) state.ship.rotation += state.ship.rotationSpeed;
    if (p1Up) {
      if (!state.ship.isThrusting) soundEffects.startThrust();
      state.ship.isThrusting = true;
      state.ship.vel.x += Math.cos(state.ship.rotation) * state.ship.thrust;
      state.ship.vel.y += Math.sin(state.ship.rotation) * state.ship.thrust;
      const particles = state.particles;
      if (Math.random() > 0.3) spawnThrustParticle(state.ship, particles);
    } else {
      if (state.ship.isThrusting) soundEffects.stopThrust();
      state.ship.isThrusting = false;
    }

    // Gamepad fire
    if (gp0.fire) shootBullet();
    if (gp0.hyperspace) hyperspace();

    const maxSpeed = 8;
    const speed = Math.hypot(state.ship.vel.x, state.ship.vel.y);
    if (speed > maxSpeed) {
      state.ship.vel.x = (state.ship.vel.x / speed) * maxSpeed;
      state.ship.vel.y = (state.ship.vel.y / speed) * maxSpeed;
    }

    state.ship.vel.x *= 0.99;
    state.ship.vel.y *= 0.99;
    state.ship.pos.x += state.ship.vel.x;
    state.ship.pos.y += state.ship.vel.y;
    state.ship.pos = wrapPosition(state.ship.pos);

    if (state.ship.invulnerableTime > 0) {
      state.ship.invulnerableTime--;
      if (state.ship.invulnerableTime === 0) state.ship.invulnerable = false;
    }

    // Update asteroids with edge-homing
    state.asteroids.forEach((asteroid) => {
      asteroid.pos.x += asteroid.vel.x;
      asteroid.pos.y += asteroid.vel.y;
      wrapAsteroidPosition(asteroid, state.ship.pos);
      asteroid.rotation += asteroid.rotationSpeed;
    });

    // Update bullets
    state.bullets = state.bullets.filter((bullet) => {
      bullet.pos.x += bullet.vel.x;
      bullet.pos.y += bullet.vel.y;
      bullet.pos = wrapPosition(bullet.pos);
      bullet.lifetime--;
      return bullet.lifetime > 0;
    });

    // UFO spawn timer
    state.ufoSpawnTimer--;
    if (state.ufoSpawnTimer <= 0 && state.ufos.length === 0 && !state.boss) {
      const size = state.wave > 6 ? (Math.random() < 0.5 ? "small" : "large") : "large";
      state.ufos.push(createUFO(size));
      state.ufoSpawnTimer = Math.max(400, 900 - state.wave * 30) + Math.random() * 400;
    }

    // Update UFOs
    state.ufos = state.ufos.filter((ufo) => {
      ufo.pos.x += ufo.vel.x;
      ufo.waveOffset += 0.03;
      ufo.vel.y = Math.sin(ufo.waveOffset) * 1.2;
      ufo.pos.y += ufo.vel.y;

      if (ufo.pos.x < -30 || ufo.pos.x > CANVAS_WIDTH + 30) return false;

      if (Math.floor(Date.now() / 1000) % 2 === 0 && Math.floor(Date.now() / 100) % 10 === 0) {
        soundEffects.ufoBeep();
      }

      ufo.shootTimer--;
      if (ufo.shootTimer <= 0) {
        ufo.shootTimer = 60 + Math.random() * 60;
        const angle = ufo.size === "small"
          ? Math.atan2(state.ship.pos.y - ufo.pos.y, state.ship.pos.x - ufo.pos.x)
          : Math.random() * Math.PI * 2;

        state.bullets.push({
          pos: { ...ufo.pos },
          vel: { x: Math.cos(angle) * 5, y: Math.sin(angle) * 5 },
          rotation: angle,
          lifetime: BULLET_LIFETIME,
          isUFO: true,
          color: "#FF4444",
        });
      }
      return true;
    });

    // Alien spawn timer
    if (!state.boss) {
      state.alienSpawnTimer--;
      if (state.alienSpawnTimer <= 0) {
        if (state.wave >= 3 && state.aliens.filter(a => a.type === "brown").length < 3) {
          state.aliens.push(createAlien("brown", state.wave));
        }
        if (state.wave >= 6 && state.aliens.filter(a => a.type === "greenMan").length < 2) {
          state.aliens.push(createAlien("greenMan", state.wave));
        }
        state.alienSpawnTimer = Math.max(180, 500 - state.wave * 20) + Math.random() * 200;
      }
    }

    // Update aliens
    state.aliens = state.aliens.filter((alien) => {
      alien.moveTimer++;
      alien.zigzagPhase += 0.05;

      if (alien.type === "brown") {
        const toShip = Math.atan2(state.ship.pos.y - alien.pos.y, state.ship.pos.x - alien.pos.x);
        const zigzag = Math.sin(alien.zigzagPhase * 3) * 0.8;
        alien.vel.x += Math.cos(toShip + zigzag) * 0.08;
        alien.vel.y += Math.sin(toShip + zigzag) * 0.08;
        const curSpd = Math.hypot(alien.vel.x, alien.vel.y);
        const maxSpd = 3 * getSpeedScale(state.wave);
        if (curSpd > maxSpd) {
          alien.vel.x = (alien.vel.x / curSpd) * maxSpd;
          alien.vel.y = (alien.vel.y / curSpd) * maxSpd;
        }
      } else {
        alien.vel.x *= 0.99;
        alien.vel.y += Math.sin(alien.zigzagPhase) * 0.02;

        alien.shootTimer--;
        if (alien.shootTimer <= 0) {
          alien.shootTimer = Math.max(40, 80 - state.wave * 2) + Math.random() * 40;
          const angle = Math.atan2(state.ship.pos.y - alien.pos.y, state.ship.pos.x - alien.pos.x);
          state.bullets.push({
            pos: { ...alien.pos },
            vel: { x: Math.cos(angle) * 6, y: Math.sin(angle) * 6 },
            rotation: angle,
            lifetime: BULLET_LIFETIME,
            isAlien: true,
            color: "#44FF44",
          });
        }
      }

      alien.pos.x += alien.vel.x;
      alien.pos.y += alien.vel.y;

      if (alien.pos.x < -60 || alien.pos.x > CANVAS_WIDTH + 60 ||
          alien.pos.y < -60 || alien.pos.y > CANVAS_HEIGHT + 60) {
        if (alien.moveTimer > 120) return false;
      }

      if (alien.pos.y < 0) alien.pos.y = CANVAS_HEIGHT;
      if (alien.pos.y > CANVAS_HEIGHT) alien.pos.y = 0;

      return true;
    });

    // Update boss
    if (state.boss) {
      const boss = state.boss;
      boss.phase += 0.02;
      if (boss.hitFlash > 0) boss.hitFlash--;

      if (!boss.entered) {
        boss.pos.y += 0.8;
        if (boss.pos.y >= boss.targetY) {
          boss.entered = true;
          boss.vel.x = 0.5;
        }
      } else {
        boss.pos.x += boss.vel.x;
        if (boss.pos.x < 100 || boss.pos.x > CANVAS_WIDTH - 100) {
          boss.vel.x *= -1;
        }
        boss.pos.y = boss.targetY + Math.sin(boss.phase) * 30;

        boss.shootTimer--;
        if (boss.shootTimer <= 0) {
          boss.shootTimer = Math.max(40, 90 - state.wave * 3);
          const baseAngle = Math.atan2(state.ship.pos.y - boss.pos.y, state.ship.pos.x - boss.pos.x);
          for (let i = -1; i <= 1; i++) {
            state.bullets.push({
              pos: { ...boss.pos },
              vel: {
                x: Math.cos(baseAngle + i * 0.3) * 4,
                y: Math.sin(baseAngle + i * 0.3) * 4,
              },
              rotation: baseAngle + i * 0.3,
              lifetime: BULLET_LIFETIME * 1.5,
              isUFO: true,
              color: "#FF66FF",
            });
          }
        }
      }
    }

    // Update power-ups
    state.powerUps = state.powerUps.filter((powerUp) => {
      powerUp.pos.x += powerUp.vel.x;
      powerUp.pos.y += powerUp.vel.y;
      powerUp.pos = wrapPosition(powerUp.pos);
      powerUp.rotation += 0.05;
      powerUp.lifetime--;

      if (checkCollision(powerUp.pos, 15, state.ship.pos, SHIP_SIZE)) {
        const powerUpLabels: Record<string, { text: string; color: string }> = {
          shield: { text: "SHIELD!", color: "#7FFF7F" },
          rapidFire: { text: "RAPID FIRE!", color: "#FF6666" },
          extraLife: { text: "+1 LIFE!", color: "#CC66FF" },
          multiplier: { text: "2x SCORE!", color: "#FFFF66" },
        };
        const label = powerUpLabels[powerUp.type];
        spawnFloatingText(powerUp.pos, label.text, label.color, 28);

        switch (powerUp.type) {
          case "shield": state.powerUpActive.shield = 300; state.ship.invulnerable = true; break;
          case "rapidFire": state.powerUpActive.rapidFire = 600; break;
          case "extraLife": state.lives++; setDisplayLives(state.lives); break;
          case "multiplier": state.powerUpActive.multiplier = 900; break;
        }
        soundEffects.powerUp();
        haptics.medium();
        return false;
      }
      return powerUp.lifetime > 0;
    });

    // Update power-up timers
    Object.keys(state.powerUpActive).forEach((key) => {
      const k = key as keyof typeof state.powerUpActive;
      if (state.powerUpActive[k] > 0) {
        state.powerUpActive[k]--;
        if (state.powerUpActive[k] === 0 && k === "shield") {
          state.ship.invulnerable = false;
        }
      }
    });

    // Update floating texts
    state.floatingTexts = state.floatingTexts.filter((ft) => {
      ft.pos.y -= 0.5;
      ft.lifetime--;
      ft.opacity = ft.lifetime / ft.maxLifetime;
      return ft.lifetime > 0;
    });

    // Update particles
    state.particles = state.particles.filter((p) => {
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.vel.x *= 0.97;
      p.vel.y *= 0.97;
      p.lifetime--;
      return p.lifetime > 0;
    });

    // Collision: Bullets vs Asteroids
    const newAsteroids: Asteroid[] = [];
    state.bullets = state.bullets.filter((bullet) => {
      if (bullet.isUFO || bullet.isAlien) return true;
      let bulletAlive = true;
      state.asteroids = state.asteroids.filter((asteroid) => {
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        if (checkCollision(bullet.pos, 2, asteroid.pos, radius)) {
          bulletAlive = false;
          const multiplier = state.powerUpActive.multiplier > 0 ? 2 : 1;
          const pts = ASTEROID_POINTS[asteroid.size] * multiplier;
          state.score += pts;
          setDisplayScore(state.score);

          const aColor = theme.asteroids[asteroid.size === "large" ? 0 : asteroid.size === "medium" ? 1 : 2];
          spawnFloatingText(asteroid.pos, `+${pts}`, aColor, 14);
          spawnExplosion(asteroid.pos, aColor, asteroid.size === "large" ? 15 : asteroid.size === "medium" ? 10 : 6);

          if (Math.floor((state.score - pts) / 10000) < Math.floor(state.score / 10000)) {
            state.lives++;
            setDisplayLives(state.lives);
            spawnFloatingText(state.ship.pos, "EXTRA LIFE!", "#CC66FF", 22);
          }

          if (asteroid.size === "large") {
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium", state.wave));
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium", state.wave));
            soundEffects.explode();
          } else if (asteroid.size === "medium") {
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small", state.wave));
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small", state.wave));
            soundEffects.explode();
          } else {
            soundEffects.smallExplode();
          }

          const powerUp = createPowerUp(asteroid.pos.x, asteroid.pos.y);
          if (powerUp) state.powerUps.push(powerUp);
          return false;
        }
        return true;
      });
      return bulletAlive;
    });
    state.asteroids.push(...newAsteroids);

    // Collision: Bullets vs UFOs
    state.bullets = state.bullets.filter((bullet) => {
      if (bullet.isUFO || bullet.isAlien) return true;
      let bulletAlive = true;
      state.ufos = state.ufos.filter((ufo) => {
        const radius = ufo.size === "large" ? 20 : 10;
        if (checkCollision(bullet.pos, 2, ufo.pos, radius)) {
          bulletAlive = false;
          const multiplier = state.powerUpActive.multiplier > 0 ? 2 : 1;
          const pts = UFO_POINTS[ufo.size] * multiplier;
          state.score += pts;
          setDisplayScore(state.score);
          soundEffects.explode();
          spawnFloatingText(ufo.pos, `+${pts}`, "#FFFF66", 18);
          spawnExplosion(ufo.pos, "#FFFF66", 15);
          const powerUp = createPowerUp(ufo.pos.x, ufo.pos.y);
          if (powerUp) state.powerUps.push(powerUp);
          return false;
        }
        return true;
      });
      return bulletAlive;
    });

    // Collision: Bullets vs Aliens
    state.bullets = state.bullets.filter((bullet) => {
      if (bullet.isUFO || bullet.isAlien) return true;
      let bulletAlive = true;
      state.aliens = state.aliens.filter((alien) => {
        const radius = alien.type === "brown" ? 12 : 14;
        if (checkCollision(bullet.pos, 2, alien.pos, radius)) {
          bulletAlive = false;
          alien.hp--;
          if (alien.hp <= 0) {
            const pts = (alien.type === "brown" ? 300 : 500) * (state.powerUpActive.multiplier > 0 ? 2 : 1);
            state.score += pts;
            setDisplayScore(state.score);
            soundEffects.explode();
            const color = alien.type === "brown" ? "#AA6633" : "#44FF44";
            spawnFloatingText(alien.pos, `+${pts}`, color, 16);
            spawnExplosion(alien.pos, color, 12);
            const powerUp = createPowerUp(alien.pos.x, alien.pos.y);
            if (powerUp) state.powerUps.push(powerUp);
            return false;
          } else {
            spawnFloatingText(alien.pos, "HIT!", "#FFFFFF", 12);
          }
        }
        return true;
      });
      return bulletAlive;
    });

    // Collision: Bullets vs Boss
    if (state.boss && state.boss.entered) {
      state.bullets = state.bullets.filter((bullet) => {
        if (bullet.isUFO || bullet.isAlien) return true;
        if (checkCollision(bullet.pos, 2, state.boss!.pos, 60)) {
          state.boss!.hp--;
          state.boss!.hitFlash = 10;
          spawnExplosion(bullet.pos, "#FF88FF", 5);
          spawnFloatingText(bullet.pos, "HIT!", "#FF88FF", 14);

          if (state.boss!.hp <= 0) {
            const pts = (2000 + state.wave * 200) * (state.powerUpActive.multiplier > 0 ? 2 : 1);
            state.score += pts;
            setDisplayScore(state.score);
            spawnFloatingText(state.boss!.pos, `+${pts}`, "#FFFF00", 24);
            spawnExplosion(state.boss!.pos, "#FF44FF", 30);
            spawnExplosion(state.boss!.pos, "#FFFF44", 20);
            soundEffects.explode();

            const types: PowerUp["type"][] = ["shield", "rapidFire", "extraLife", "multiplier"];
            state.powerUps.push({
              pos: { ...state.boss!.pos },
              vel: { x: (Math.random() - 0.5), y: (Math.random() - 0.5) },
              rotation: 0,
              type: types[Math.floor(Math.random() * types.length)],
              lifetime: 600,
            });

            state.boss = null;
            state.bossDefeated = true;
            toast.success("BOSS DEFEATED!");
          }
          return false;
        }
        return true;
      });
    }

    // Collision: Ship vs Asteroids
    if (!state.ship.invulnerable && state.powerUpActive.shield === 0) {
      for (const asteroid of state.asteroids) {
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        if (checkCollision(state.ship.pos, SHIP_SIZE, asteroid.pos, radius)) {
          loseLife(state);
          break;
        }
      }
    }

    // Collision: Ship vs UFOs
    if (!state.ship.invulnerable && state.powerUpActive.shield === 0) {
      for (const ufo of state.ufos) {
        const radius = ufo.size === "large" ? 20 : 10;
        if (checkCollision(state.ship.pos, SHIP_SIZE, ufo.pos, radius)) {
          loseLife(state);
          break;
        }
      }
    }

    // Collision: Ship vs Aliens
    if (!state.ship.invulnerable && state.powerUpActive.shield === 0) {
      for (const alien of state.aliens) {
        if (checkCollision(state.ship.pos, SHIP_SIZE, alien.pos, 12)) {
          loseLife(state);
          break;
        }
      }
    }

    // Collision: Ship vs Boss tentacles
    if (state.boss && state.boss.entered && !state.ship.invulnerable && state.powerUpActive.shield === 0) {
      if (checkCollision(state.ship.pos, SHIP_SIZE, state.boss.pos, 65)) {
        loseLife(state);
      }
    }

    // Collision: Enemy bullets vs Ship
    if (!state.ship.invulnerable && state.powerUpActive.shield === 0) {
      state.bullets = state.bullets.filter((bullet) => {
        if (!bullet.isUFO && !bullet.isAlien) return true;
        if (checkCollision(bullet.pos, 2, state.ship.pos, SHIP_SIZE)) {
          loseLife(state);
          return false;
        }
        return true;
      });
    }

    // Check wave completion
    const noEnemies = state.asteroids.length === 0 && state.ufos.length === 0 && state.aliens.length === 0 && !state.boss;
    if (noEnemies) {
      nextWave();
    }
  }, [nextWave, loseLife, shootBullet, hyperspace]);

  // ===== DRAW SHIP HELPER =====
  const drawShip = (ctx: CanvasRenderingContext2D, ship: Ship, color: string, label?: string) => {
    ctx.save();
    ctx.translate(ship.pos.x, ship.pos.y);
    ctx.rotate(ship.rotation);
    if (!ship.invulnerable || Math.floor(Date.now() / 100) % 2 === 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(SHIP_SIZE, 0);
      ctx.lineTo(-SHIP_SIZE, -SHIP_SIZE / 2);
      ctx.lineTo(-SHIP_SIZE / 2, 0);
      ctx.lineTo(-SHIP_SIZE, SHIP_SIZE / 2);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 25;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Draw label above ship
    if (label) {
      ctx.save();
      ctx.font = "7px 'Press Start 2P', monospace";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.7;
      ctx.fillText(label, ship.pos.x, ship.pos.y - 18);
      ctx.restore();
    }
  };

  // ===== DRAW COMMON ELEMENTS =====
  const drawCommon = (ctx: CanvasRenderingContext2D, stars: Star[], particles: Particle[], floatingTexts: FloatingText[], asteroids: Asteroid[], aliens: Alien[], bgColor: string, asteroidColors: string[]) => {
    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Parallax starfield
    const time = Date.now() * 0.001;
    stars.forEach((star) => {
      const parallaxSpeed = [0.1, 0.3, 0.6][star.layer];
      const offsetX = (time * parallaxSpeed * 10) % CANVAS_WIDTH;
      const drawX = ((star.x - offsetX) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
      const twinkle = 0.7 + Math.sin(time * 2 + star.x * 0.1) * 0.3;
      ctx.fillStyle = `rgba(200, 220, 255, ${star.brightness * twinkle})`;
      ctx.beginPath();
      ctx.arc(drawX, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Particles
    particles.forEach((p) => {
      const alpha = p.lifetime / p.maxLifetime;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 6;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Asteroids
    asteroids.forEach((asteroid) => {
      ctx.save();
      ctx.translate(asteroid.pos.x, asteroid.pos.y);
      ctx.rotate(asteroid.rotation);
      const colorIdx = asteroid.size === "large" ? 0 : asteroid.size === "medium" ? 1 : 2;
      const color = asteroidColors[colorIdx];
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.beginPath();
      asteroid.points.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 20;
      ctx.globalAlpha = 0.15;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    });

    // Brown aliens
    aliens.filter(a => a.type === "brown").forEach((alien) => {
      ctx.save();
      ctx.translate(alien.pos.x, alien.pos.y);
      ctx.rotate(Math.atan2(alien.vel.y, alien.vel.x));
      ctx.strokeStyle = "#AA6633";
      ctx.fillStyle = "#553311";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#AA6633";
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -8);
      ctx.lineTo(-10, -4);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-10, 4);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, -8);
      ctx.lineTo(-2, -14);
      ctx.moveTo(-6, 8);
      ctx.lineTo(-2, 14);
      ctx.stroke();
      ctx.restore();
    });

    // Green men
    aliens.filter(a => a.type === "greenMan").forEach((alien) => {
      ctx.save();
      ctx.translate(alien.pos.x, alien.pos.y);
      ctx.strokeStyle = "#44FF44";
      ctx.fillStyle = "#115511";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#44FF44";
      ctx.beginPath();
      ctx.arc(0, -8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(-3, -9, 2, 0, Math.PI * 2);
      ctx.arc(3, -9, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(-3, -9, 1, 0, Math.PI * 2);
      ctx.arc(3, -9, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#44FF44";
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(0, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(-8, -1);
      ctx.moveTo(0, 2);
      ctx.lineTo(8, 5);
      ctx.stroke();
      ctx.strokeStyle = "#FFFF00";
      ctx.beginPath();
      ctx.moveTo(8, 5);
      ctx.lineTo(14, 3);
      ctx.stroke();
      ctx.strokeStyle = "#44FF44";
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(-5, 16);
      ctx.moveTo(0, 8);
      ctx.lineTo(5, 16);
      ctx.stroke();
      ctx.restore();
    });

    // Floating texts
    floatingTexts.forEach((ft) => {
      ctx.save();
      ctx.globalAlpha = ft.opacity;
      ctx.font = `${ft.size}px 'Press Start 2P', monospace`;
      ctx.fillStyle = ft.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = ft.color;
      ctx.textAlign = "center";
      ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
      ctx.restore();
    });

    // CRT scanline overlay
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = "#000000";
    for (let y = 0; y < CANVAS_HEIGHT; y += 3) {
      ctx.fillRect(0, y, CANVAS_WIDTH, 1);
    }
    const gradient = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.4, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.8);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  };

  // ===== DRAW BULLETS HELPER =====
  const drawBullets = (ctx: CanvasRenderingContext2D, bullets: Bullet[], defaultColor: string) => {
    bullets.forEach((bullet) => {
      ctx.save();
      const bColor = bullet.color || defaultColor;
      ctx.fillStyle = bColor;
      ctx.shadowBlur = 12;
      ctx.shadowColor = bColor;
      ctx.beginPath();
      ctx.arc(bullet.pos.x, bullet.pos.y, (bullet.isUFO || bullet.isAlien) ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 20;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(bullet.pos.x, bullet.pos.y, (bullet.isUFO || bullet.isAlien) ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    });
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if ((gameModeRef.current === "duel" || gameModeRef.current === "online") && duelStateRef.current) {
      const ds = duelStateRef.current;
      drawCommon(ctx, ds.stars, ds.particles, ds.floatingTexts, ds.asteroids, ds.aliens, "#050510", ["#FFFFFF", "#88DDFF", "#44AAFF"]);

      // Draw ships
      if (ds.respawnTimer[0] === 0) drawShip(ctx, ds.ship1, P1_COLOR, "P1");
      if (ds.respawnTimer[1] === 0) drawShip(ctx, ds.ship2, P2_COLOR, "P2");

      // Draw bullets
      drawBullets(ctx, ds.bullets1, P1_COLOR);
      drawBullets(ctx, ds.bullets2, P2_COLOR);

      return;
    }

    if (!gameStateRef.current) return;
    const state = gameStateRef.current;
    const theme = getTheme(state.wave);

    drawCommon(ctx, state.stars, state.particles, state.floatingTexts, state.asteroids, state.aliens, theme.bg, theme.asteroids);

    // Ship
    const shipColor = state.powerUpActive.shield > 0 ? "#7FFF7F" : theme.ship;
    drawShip(ctx, state.ship, shipColor);

    // Bullets
    drawBullets(ctx, state.bullets, theme.ship);

    // UFOs
    state.ufos.forEach((ufo) => {
      ctx.save();
      ctx.translate(ufo.pos.x, ufo.pos.y);
      const ufoColor = ufo.size === "large" ? theme.enemy : "#FF44FF";
      ctx.strokeStyle = ufoColor;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 18;
      ctx.shadowColor = ufoColor;
      const radius = ufo.size === "large" ? 20 : 10;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -radius / 4, radius / 2, radius / 3, 0, 0, Math.PI, true);
      ctx.stroke();
      const pulse = 0.3 + Math.sin(Date.now() * 0.005) * 0.2;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = ufoColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    });

    // Boss
    if (state.boss) {
      const boss = state.boss;
      ctx.save();
      ctx.translate(boss.pos.x, boss.pos.y);

      const bossColor = boss.hitFlash > 0 ? "#FFFFFF" : "#FF44CC";
      ctx.shadowBlur = 30;
      ctx.shadowColor = bossColor;

      const tentCount = boss.tentacles;
      for (let i = 0; i < tentCount; i++) {
        const baseAngle = (i / tentCount) * Math.PI * 2;
        ctx.strokeStyle = boss.hitFlash > 0 ? "#FFFFFF" : "#CC44AA";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const segments = 5;
        for (let s = 1; s <= segments; s++) {
          const dist = s * 18;
          const wave = Math.sin(boss.phase * 2 + i + s * 0.8) * 15;
          const tx = Math.cos(baseAngle) * dist + Math.cos(baseAngle + Math.PI / 2) * wave;
          const ty = Math.sin(baseAngle) * dist + Math.sin(baseAngle + Math.PI / 2) * wave;
          ctx.lineTo(tx, ty);
        }
        ctx.stroke();
      }

      const pulse = 1 + Math.sin(boss.phase * 3) * 0.05;
      const bodyR = 45 * pulse;
      ctx.fillStyle = boss.hitFlash > 0 ? "#FFFFFF" : "#331133";
      ctx.strokeStyle = bossColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = bossColor;
      ctx.beginPath();
      ctx.arc(0, -5, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(0, -5, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      ctx.save();
      const barW = 200;
      const barH = 8;
      const barX = (CANVAS_WIDTH - barW) / 2;
      const barY = CANVAS_HEIGHT - 30;
      const hpFrac = boss.hp / boss.maxHp;
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = "#FF44CC";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.fillStyle = hpFrac > 0.3 ? "#FF44CC" : "#FF0000";
      ctx.fillRect(barX, barY, barW * hpFrac, barH);
      ctx.globalAlpha = 0.9;
      ctx.font = "8px 'Press Start 2P', monospace";
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.fillText("BOSS", CANVAS_WIDTH / 2, barY - 4);
      ctx.restore();
    }

    // Power-ups
    state.powerUps.forEach((powerUp) => {
      ctx.save();
      ctx.translate(powerUp.pos.x, powerUp.pos.y);
      ctx.rotate(powerUp.rotation);
      const color = powerUp.type === "shield" ? "#7FFF7F"
        : powerUp.type === "rapidFire" ? "#FF6666"
        : powerUp.type === "multiplier" ? "#FFFF66"
        : "#CC66FF";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      // Draw hexagon (6 sides, bigger = 14px radius)
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * 14;
        const y = Math.sin(angle) * 14;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      // Draw icon label always upright
      ctx.rotate(-powerUp.rotation);
      ctx.fillStyle = color;
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const icon = powerUp.type === "shield" ? "SH"
        : powerUp.type === "rapidFire" ? "RF"
        : powerUp.type === "extraLife" ? "+1"
        : "2X";
      ctx.fillText(icon, 0, 0);
      ctx.restore();
    });

    // Power-up HUD bars
    const activePowerUps: { label: string; color: string; remaining: number; max: number }[] = [];
    if (state.powerUpActive.shield > 0) activePowerUps.push({ label: "SHIELD", color: "#7FFF7F", remaining: state.powerUpActive.shield, max: 300 });
    if (state.powerUpActive.rapidFire > 0) activePowerUps.push({ label: "RAPID", color: "#FF6666", remaining: state.powerUpActive.rapidFire, max: 600 });
    if (state.powerUpActive.multiplier > 0) activePowerUps.push({ label: "2x", color: "#FFFF66", remaining: state.powerUpActive.multiplier, max: 900 });

    activePowerUps.forEach((pu, i) => {
      const barX = 10;
      const barY = 10 + i * 18;
      const barW = 120;
      const barH = 12;
      const fill = pu.remaining / pu.max;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = pu.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.fillStyle = pu.color;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(barX, barY, barW * fill, barH);
      ctx.globalAlpha = 0.9;
      ctx.font = "7px 'Press Start 2P', monospace";
      ctx.fillStyle = pu.color;
      ctx.shadowBlur = 4;
      ctx.shadowColor = pu.color;
      ctx.fillText(pu.label, barX + 3, barY + 10);
      ctx.restore();
    });

    // Wave/theme indicator
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.fillStyle = theme.accent;
    ctx.textAlign = "right";
    ctx.fillText(`${theme.name.toUpperCase()} ZONE`, CANVAS_WIDTH - 10, 18);
    ctx.restore();

    // Now playing marquee at bottom of canvas
    const np = nowPlayingRef.current;
    if (np) {
      ctx.save();
      ctx.font = "13px 'Press Start 2P', monospace";
      const npText = `* ${np.artist} -- ${np.title}   `;
      const npTextWidth = ctx.measureText(npText).width;
      // Advance marquee position
      nowPlayingMarqueeXRef.current -= MARQUEE_SPEED;
      if (nowPlayingMarqueeXRef.current < -(npTextWidth)) {
        nowPlayingMarqueeXRef.current = CANVAS_WIDTH;
      }
      // Clip to bottom strip
      ctx.beginPath();
      ctx.rect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
      ctx.clip();
      // Demoscene glow backdrop
      const glowGrad = ctx.createLinearGradient(0, CANVAS_HEIGHT - 30, 0, CANVAS_HEIGHT);
      glowGrad.addColorStop(0, "rgba(0, 150, 255, 0)");
      glowGrad.addColorStop(0.5, "rgba(0, 150, 255, 0.15)");
      glowGrad.addColorStop(1, "rgba(0, 150, 255, 0.05)");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
      // Scanlines overlay
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = "#000000";
      for (let i = 0; i < 15; i++) {
        ctx.fillRect(0, CANVAS_HEIGHT - 30 + i * 2, CANVAS_WIDTH, 1);
      }
      // Glow text effect
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = "#00CCFF";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#AAEEFF";
      ctx.textAlign = "left";
      ctx.fillText(npText, nowPlayingMarqueeXRef.current, CANVAS_HEIGHT - 9);
      ctx.restore();
    }

    // Oneliner marquee near top of canvas
    const ol = onelinerRef.current;
    if (ol) {
      ctx.save();
      ctx.font = "11px 'Press Start 2P', monospace";
      const olText = `[${ol.author}] ${ol.message}   `;
      const olTextWidth = ctx.measureText(olText).width;
      // Advance marquee position
      onelinerMarqueeXRef.current -= MARQUEE_SPEED;
      if (onelinerMarqueeXRef.current < -(olTextWidth)) {
        onelinerMarqueeXRef.current = CANVAS_WIDTH;
      }
      // Clip to top strip
      ctx.beginPath();
      ctx.rect(0, 18, CANVAS_WIDTH, 22);
      ctx.clip();
      // Demoscene glow backdrop (gold)
      const olGlowGrad = ctx.createLinearGradient(0, 18, 0, 40);
      olGlowGrad.addColorStop(0, "rgba(255, 180, 0, 0)");
      olGlowGrad.addColorStop(0.5, "rgba(255, 180, 0, 0.12)");
      olGlowGrad.addColorStop(1, "rgba(255, 180, 0, 0)");
      ctx.fillStyle = olGlowGrad;
      ctx.fillRect(0, 18, CANVAS_WIDTH, 22);
      // Scanlines overlay
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = "#000000";
      for (let i = 0; i < 11; i++) {
        ctx.fillRect(0, 18 + i * 2, CANVAS_WIDTH, 1);
      }
      // Glow text effect
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = "#FFAA00";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#FFE066";
      ctx.textAlign = "left";
      ctx.fillText(olText, onelinerMarqueeXRef.current, 35);
      ctx.restore();
    }

    // ===== CRT / SCANLINE OVERLAY =====
    ctx.save();

    // Scanlines — fine horizontal lines every 2px
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "#000000";
    for (let y = 0; y < CANVAS_HEIGHT; y += 2) {
      ctx.fillRect(0, y, CANVAS_WIDTH, 1);
    }

    // Phosphor RGB sub-pixel shimmer (very subtle vertical lines)
    ctx.globalAlpha = 0.025;
    for (let x = 0; x < CANVAS_WIDTH; x += 3) {
      ctx.fillStyle = x % 3 === 0 ? "#FF0000" : x % 3 === 1 ? "#00FF00" : "#0000FF";
      ctx.fillRect(x, 0, 1, CANVAS_HEIGHT);
    }

    // Vignette — radial dark corners
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.3,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.85
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Subtle top-to-bottom phosphor roll flicker
    const flickerAlpha = 0.015 + Math.sin(Date.now() * 0.003) * 0.01;
    ctx.globalAlpha = flickerAlpha;
    const flickerGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    flickerGrad.addColorStop(0, "rgba(255,255,255,0)");
    flickerGrad.addColorStop(0.5, "rgba(255,255,255,1)");
    flickerGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = flickerGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.restore();
  }, []);

  const gameLoop = useCallback(() => {
    if (gameModeRef.current === "duel") {
      updateDuel();
    } else if (gameModeRef.current === "solo") {
      update();
    } else if (gameModeRef.current === "online") {
      // Host: send inputs to worker
      if (isHostRef.current && workerRef.current) {
        const keys = keysRef.current;
        const gp0 = readGamepad(0);
        workerRef.current.postMessage({
          type: 'inputs',
          p1: { left: keys["ArrowLeft"] || gp0.left, right: keys["ArrowRight"] || gp0.right, up: keys["ArrowUp"] || gp0.up, fire: keys[" "] || gp0.fire },
          p2: multiplayer.remoteInputRef.current,
        });
      }
      // Guest: send inputs to host
      if (!isHostRef.current && isConnectedRef.current) {
        const keys = keysRef.current;
        const gp0 = readGamepad(0);
        multiplayer.sendInputs({
          left: keys["ArrowLeft"] || gp0.left, right: keys["ArrowRight"] || gp0.right,
          up: keys["ArrowUp"] || gp0.up, fire: keys[" "] || gp0.fire,
        });
      }
      updateOnlineVisuals();
    }
    draw();
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [update, updateDuel, draw, updateOnlineVisuals, multiplayer.sendInputs]);

  useEffect(() => {
    enteringInitialsRef.current = enteringInitials;
  }, [enteringInitials]);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Try to autoplay radio on first user interaction (browsers block autoplay without gesture)
  useEffect(() => {
    const tryPlay = () => {
      if (radioStartedRef.current) return;
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          radioStartedRef.current = true;
        }).catch(() => { /* still blocked, will retry on next interaction */ });
      }
    };
    window.addEventListener("click", tryPlay, { once: false });
    window.addEventListener("keydown", tryPlay, { once: false });
    window.addEventListener("touchstart", tryPlay, { once: false });
    // Also try immediately
    tryPlay();
    return () => {
      window.removeEventListener("click", tryPlay);
      window.removeEventListener("keydown", tryPlay);
      window.removeEventListener("touchstart", tryPlay);
    };
  }, []);

  // Poll Nectarine now-playing info via edge function
  useEffect(() => {
    const fetchNowPlaying = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("scenestream-proxy", {
          body: { endpoint: "/demovibes/xml/queue/" },
        });
        if (error) throw error;
        
        const text = typeof data === "string" ? data : JSON.stringify(data);
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");
        const nowEntry = xml.querySelector("now > entry");
        if (nowEntry) {
          const artists = nowEntry.querySelectorAll("artist");
          const artistName = Array.from(artists).map(a => a.textContent).join(" & ") || "Unknown";
          const songEl = nowEntry.querySelector("song");
          const songTitle = songEl?.textContent || "Unknown";
          const info = { artist: artistName, title: songTitle };
          nowPlayingRef.current = info;
          nowPlayingMarqueeXRef.current = CANVAS_WIDTH;
          setNowPlaying(info);
        }
      } catch (e) {
        console.log("Could not fetch now-playing info:", e);
      }
    };
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 30000);
    return () => clearInterval(interval);
  }, []);

  // Poll Nectarine oneliner chat via edge function
  useEffect(() => {
    const fetchOneliner = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("scenestream-proxy", {
          body: { endpoint: "/demovibes/xml/oneliner/" },
        });
        if (error) throw error;
        
        const text = typeof data === "string" ? data : JSON.stringify(data);
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");
        const firstEntry = xml.querySelector("entry");
        if (firstEntry) {
          const time = firstEntry.getAttribute("time") || "";
          if (time !== lastOnelinerTimeRef.current) {
            lastOnelinerTimeRef.current = time;
            const author = firstEntry.querySelector("author")?.textContent || "???";
            const message = firstEntry.querySelector("message")?.textContent || "";
            onelinerRef.current = { author, message };
            onelinerMarqueeXRef.current = CANVAS_WIDTH;
          }
        }
      } catch (e) {
        console.log("Could not fetch oneliner:", e);
      }
    };
    fetchOneliner();
    const interval = setInterval(fetchOneliner, 15000);
    return () => clearInterval(interval);
  }, []);

  // ===== ONLINE EFFECTS =====
  const applyNetStateRef = useRef<(net: DuelNetState) => void>(() => {});
  const sendStateRef = useRef<(state: DuelNetState) => void>(() => {});
  useEffect(() => { applyNetStateRef.current = applyNetState; }, [applyNetState]);
  useEffect(() => { sendStateRef.current = multiplayer.sendState; }, [multiplayer.sendState]);
  useEffect(() => { isHostRef.current = multiplayer.isHost; }, [multiplayer.isHost]);
  useEffect(() => { isConnectedRef.current = multiplayer.isConnected; }, [multiplayer.isConnected]);

  // Guest: poll for state updates
  useEffect(() => {
    if (gameModeRef.current !== "online" || multiplayer.isHost) return;
    const remoteRef = multiplayer.remoteStateRef;
    const interval = setInterval(() => {
      const state = remoteRef.current;
      if (state) { applyNetStateRef.current(state); remoteRef.current = null; }
    }, 16);
    return () => clearInterval(interval);
  }, [gameMode, multiplayer.isHost]);

  // Guest: listen for game_start
  useEffect(() => {
    multiplayer.onGameStartRef.current = () => { initOnline(false); };
  }, [initOnline]);

  // Host: worker message handler
  useEffect(() => {
    if (gameModeRef.current !== "online" || !multiplayer.isHost) return;
    const worker = workerRef.current;
    if (!worker) return;
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'state') {
        const net: DuelNetState = e.data.data;
        applyNetStateRef.current(net);
        broadcastTickRef.current++;
        if (broadcastTickRef.current % 3 === 0) { sendStateRef.current(net); }
      }
    };
  }, [gameMode, multiplayer.isHost]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'stop' });
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const continueAfterLifeLost = useCallback(() => {
    showLifeLostRef.current = false;
    setShowLifeLost(false);
  }, []);

  const quitToMenu = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (gameModeRef.current === "online" || gameModeRef.current === "online_lobby") {
      multiplayer.disconnect();
    }
    gameStateRef.current = null;
    duelStateRef.current = null;
    setGameMode("menu");
    setShowGameOver(false);
    setShowLifeLost(false);
    showLifeLostRef.current = false;
    isPausedRef.current = false;
    setIsPaused(false);
    soundEffects.stopThrust();
  }, [multiplayer]);

  const togglePause = useCallback(() => {
    isPausedRef.current = !isPausedRef.current;
    setIsPaused(isPausedRef.current);
    setPauseSelection(0);
    if (isPausedRef.current) {
      soundEffects.stopThrust();
    }
  }, []);

  const resumeGame = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (enteringInitialsRef.current) return;

      // Pause toggle on Escape
      if (e.key === "Escape" && (gameModeRef.current === "solo" || gameModeRef.current === "duel" || gameModeRef.current === "online")) {
        if (!showLifeLostRef.current && !showGameOver) {
          e.preventDefault();
          togglePause();
          return;
        }
      }

      // When paused, handle pause menu navigation
      if (isPausedRef.current) {
        if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "w" || e.key === "W" || e.key === "s" || e.key === "S") {
          e.preventDefault();
          setPauseSelection(s => s === 0 ? 1 : 0);
        }
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setPauseSelection(s => {
            if (s === 0) resumeGame();
            else { resumeGame(); quitToMenu(); }
            return s;
          });
        }
        return;
      }

      if (showLifeLostRef.current) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          showLifeLostRef.current = false;
          setShowLifeLost(false);
        }
        return;
      }
      keysRef.current[e.key] = true;
      if (gameModeRef.current === "solo") {
        if (e.key === " ") { e.preventDefault(); shootBullet(); }
        if (e.key === "h" || e.key === "H") { e.preventDefault(); hyperspace(); }
      } else if (gameModeRef.current === "duel" || gameModeRef.current === "online") {
        if (e.key === " ") { e.preventDefault(); }
        if (e.key === "e" || e.key === "E") { e.preventDefault(); }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.key] = false; };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [shootBullet, hyperspace, gameLoop, togglePause, resumeGame, quitToMenu, showGameOver]);

  // Gamepad polling for menus and overlays
  useEffect(() => {
    let rafId: number;
    const poll = () => {
      try {
        const gamepads = navigator.getGamepads();
        const gp = gamepads[0] || gamepads[1];
        if (gp) {
          const btnA = gp.buttons[0]?.pressed ?? false;
          const btnB = gp.buttons[1]?.pressed ?? false;
          const upAxis = (gp.axes[1] ?? 0) < -GAMEPAD_DEADZONE;
          const downAxis = (gp.axes[1] ?? 0) > GAMEPAD_DEADZONE;
          const dpadUp = gp.buttons[12]?.pressed ?? false;
          const dpadDown = gp.buttons[13]?.pressed ?? false;
          const btnStart = gp.buttons[9]?.pressed ?? false;
          const up = upAxis || dpadUp;
          const down = downAxis || dpadDown;
          const prev = prevGamepadButtonRef.current;
          const justA = btnA && !prev[0];
          const justUp = up && !prev[2];
          const justDown = down && !prev[3];
          const justB = btnB && !prev[1];
          const justStart = btnStart && !prev[6];
          prev[0] = btnA;
          prev[1] = btnB;
          prev[2] = up;
          prev[3] = down;
          prev[6] = btnStart;

          // Start button toggles pause during gameplay
          if (justStart && (gameModeRef.current === "solo" || gameModeRef.current === "duel" || gameModeRef.current === "online") && !showLifeLostRef.current && !showGameOver) {
            togglePause();
          }

          // When paused, handle pause menu
          if (isPausedRef.current) {
            if (justUp || justDown) {
              setPauseSelection(s => s === 0 ? 1 : 0);
            }
            if (justA) {
              setPauseSelection(s => {
                if (s === 0) resumeGame();
                else { resumeGame(); quitToMenu(); }
                return s;
              });
            }
          } else if (gameModeRef.current === "menu") {
            if (justUp) { setMenuSelection(s => (s - 1 + 3) % 3); }
            if (justDown) { setMenuSelection(s => (s + 1) % 3); }
            if (justA) {
              setMenuSelection(s => {
                if (s === 0) initGame();
                else if (s === 1) initDuel();
                else setGameMode("online_lobby");
                return s;
              });
            }
          } else if (showLifeLostRef.current) {
            if (justA) {
              showLifeLostRef.current = false;
              setShowLifeLost(false);
            }
          } else if (showGameOver) {
            if (!enteringInitialsRef.current) {
              if (justUp || justDown) {
                setGameOverSelection(s => s === 0 ? 1 : 0);
              }
              if (justA) {
                setGameOverSelection(s => {
                  if (s === 0) initGame();
                  else {
                    gameStateRef.current = null;
                    duelStateRef.current = null;
                    setGameMode("menu");
                    setShowGameOver(false);
                    setShowLifeLost(false);
                    showLifeLostRef.current = false;
                    soundEffects.stopThrust();
                  }
                  return s;
                });
              }
            }
          } else if (gameModeRef.current === "duel" || gameModeRef.current === "online") {
            if (justB) {
              quitToMenu();
            }
          }
        }
      } catch { /* no gamepad */ }
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [initGame, initDuel, showGameOver, togglePause, resumeGame, quitToMenu]);


  // ===== CRT BOOT ANIMATION =====
  if (showBootAnimation) {
    return <CRTBootOverlay onComplete={() => setShowBootAnimation(false)} />;
  }

  // ===== ONLINE LOBBY SCREEN =====
  if (gameMode === "online_lobby") {
    return (
      <div className="min-h-screen bg-[hsl(var(--game-background))] flex flex-col items-center justify-center p-4">
        <OnlineLobby
          onCreateRoom={() => multiplayer.createRoom()}
          onJoinRoom={(code) => multiplayer.joinRoom(code)}
          onBack={() => { multiplayer.disconnect(); setGameMode("menu"); }}
          onStartGame={() => { multiplayer.startGame(); initOnline(true); }}
          roomCode={multiplayer.roomCode}
          isHost={multiplayer.isHost}
          isConnected={multiplayer.isConnected}
          opponentConnected={multiplayer.opponentConnected}
        />
      </div>
    );
  }

  // ===== MENU SCREEN =====
  if (gameMode === "menu") {
    return (
      <div className="min-h-screen bg-[hsl(var(--game-background))] flex flex-col items-center justify-center p-4">
        <div className="text-6xl font-mono text-[hsl(var(--game-foreground))] mb-2 tracking-widest" style={{ textShadow: "0 0 30px hsl(var(--game-foreground))" }}>
          ASTEROIDS
        </div>
        <div className="text-sm font-mono text-[hsl(var(--game-foreground))] opacity-50 mb-12">
          DEMOSCENE EDITION
        </div>

        <div className="flex flex-col gap-4 items-center mb-12">
          <Button
            onClick={initGame}
            className={`text-2xl px-12 py-6 font-mono tracking-wider transition-all ${
              menuSelection === 0
                ? "bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] shadow-[0_0_20px_hsl(var(--game-foreground))]"
                : "bg-[hsl(var(--game-foreground))]/20 text-[hsl(var(--game-foreground))] border-2 border-[hsl(var(--game-foreground))]/40"
            }`}
          >
            {menuSelection === 0 ? "▸ " : "  "}SOLO
          </Button>
          <Button
            onClick={initDuel}
            className={`text-2xl px-12 py-6 font-mono tracking-wider border-2 transition-all ${
              menuSelection === 1
                ? "shadow-[0_0_20px_rgba(255,136,68,0.5)]"
                : "opacity-60"
            }`}
            style={{ borderColor: P2_COLOR, color: P2_COLOR, background: menuSelection === 1 ? "rgba(255,136,68,0.15)" : "transparent" }}
          >
            {menuSelection === 1 ? "▸ " : "  "}DUEL
          </Button>
          <Button
            onClick={() => setGameMode("online_lobby")}
            className={`text-2xl px-12 py-6 font-mono tracking-wider border-2 transition-all ${
              menuSelection === 2
                ? "shadow-[0_0_20px_rgba(68,255,68,0.5)] border-[#44FF44] text-[#44FF44] bg-[rgba(68,255,68,0.15)]"
                : "opacity-60 border-[#44FF44]/60 text-[#44FF44]/60"
            }`}
          >
            {menuSelection === 2 ? "▸ " : "  "}ONLINE
          </Button>
        </div>

        <div className="text-[hsl(var(--game-foreground))] font-mono text-xs space-y-1 opacity-60 text-center">
          <div>SOLO: Arrow Keys + Space | Gamepad supported</div>
          <div>DUEL: P1 Arrows+Space | P2 WASD+E | Gamepads 1 & 2</div>
          <div>ONLINE: Create or join a room to duel remotely</div>
        </div>

        <div className="mt-8 flex flex-col gap-2 max-w-md">
          <div className="text-[hsl(var(--game-foreground))] font-mono text-sm text-center">
            🎵 NECTARINE DEMOSCENE RADIO
          </div>
          {nowPlaying && (
            <div className="text-[hsl(var(--game-foreground))] font-mono text-xs text-center animate-pulse">
              <span className="opacity-90">{nowPlaying.artist}</span>
              <span className="opacity-50"> — </span>
              <span className="opacity-80">{nowPlaying.title}</span>
            </div>
          )}
          <audio
            ref={audioRef}
            controls
            autoPlay
            preload="auto"
            className="w-full"
            onError={(e) => {
              const target = e.currentTarget;
              console.error("Audio loading error:", target.error?.message);
            }}
          >
            <source src="https://nectarine.inversi0n.org/necta192.mp3" type="audio/mpeg" />
          </audio>
          <div className="text-[hsl(var(--game-foreground))] font-mono text-xs text-center opacity-60 mt-1">
            Thanks to <a href="https://scenestream.net/demovibes/" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">Nectarine Demoscene Radio</a> for the music!
          </div>
          <div className="text-[hsl(var(--game-foreground))] font-mono text-[10px] text-center opacity-40 mt-0.5">
            Streaming demoscene & chiptune tracks 24/7
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--game-background))] flex flex-col items-center justify-center p-4">
      {/* HUD */}
      {gameMode === "solo" && (
        <div className="mb-4 flex gap-8 text-[hsl(var(--game-foreground))] text-xs tracking-wide" style={{ fontFamily: "'Press Start 2P', monospace", textShadow: "0 0 10px hsl(var(--game-foreground))" }}>
          <div>SCORE: {displayScore.toString().padStart(8, "0")}</div>
          <div>LIVES: {displayLives}</div>
          <div>WAVE: {displayWave}</div>
        </div>
      )}
      {(gameMode === "duel" || gameMode === "online") && (
        <div className="mb-4 flex gap-6 text-xs tracking-wide" style={{ fontFamily: "'Press Start 2P', monospace" }}>
          <div style={{ color: P1_COLOR, textShadow: `0 0 10px ${P1_COLOR}` }}>
            P1{gameMode === "online" && multiplayer.isHost ? " (YOU)" : ""} K:{duelKills[0]} D:{duelDeaths[0]}
          </div>
          <div className="text-[hsl(var(--game-foreground))] opacity-30">|</div>
          <div style={{ color: P2_COLOR, textShadow: `0 0 10px ${P2_COLOR}` }}>
            P2{gameMode === "online" && !multiplayer.isHost ? " (YOU)" : ""} K:{duelKills[1]} D:{duelDeaths[1]}
          </div>
          {gameMode === "online" && multiplayer.roomCode && (
            <div className="text-[hsl(var(--game-foreground))] opacity-40 text-xs self-center">
              ROOM: {multiplayer.roomCode}
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border-2 border-[hsl(var(--game-foreground))] shadow-[0_0_30px_hsl(var(--game-foreground))] max-w-full"
          style={{ touchAction: 'none' }}
        />

        {showLifeLost && !showGameOver && gameMode === "solo" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
            <div className="text-4xl font-mono text-[hsl(var(--game-danger))] mb-6 animate-pulse">
              LIFE LOST!
            </div>
            <Button
              onClick={continueAfterLifeLost}
              onTouchEnd={(e) => { e.preventDefault(); continueAfterLifeLost(); }}
              className="bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] hover:bg-[hsl(var(--game-glow))] text-xl px-8 py-4 font-mono"
            >
              PRESS TO CONTINUE
            </Button>
            <div className="text-lg font-mono text-[hsl(var(--game-foreground))] mt-4 opacity-70">
              LIVES REMAINING: {displayLives}
            </div>
          </div>
        )}

        {showGameOver && gameMode === "solo" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 overflow-auto py-4">
            <div className="text-5xl font-mono text-[hsl(var(--game-danger))] mb-4 animate-pulse">
              GAME OVER
            </div>
            <div className="text-2xl font-mono text-[hsl(var(--game-foreground))] mb-4">
              FINAL SCORE: {displayScore.toString().padStart(8, "0")}
            </div>

            {enteringInitials && (
              <div className="mb-4 flex flex-col items-center gap-2">
                <div className="text-lg font-mono text-[hsl(var(--game-glow))]">NEW HIGH SCORE! ENTER INITIALS:</div>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    maxLength={3}
                    value={initials}
                    onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && initials.length > 0) {
                        saveToLeaderboard(initials, displayScore);
                        setEnteringInitials(false);
                      }
                      e.stopPropagation();
                    }}
                    autoFocus
                    className="w-20 text-center text-2xl font-mono bg-transparent border-2 border-[hsl(var(--game-foreground))] text-[hsl(var(--game-foreground))] p-1 uppercase tracking-widest"
                    placeholder="___"
                  />
                  <Button
                    onClick={() => {
                      if (initials.length > 0) {
                        saveToLeaderboard(initials, displayScore);
                        setEnteringInitials(false);
                      }
                    }}
                    className="bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] hover:bg-[hsl(var(--game-glow))] font-mono"
                  >
                    OK
                  </Button>
                </div>
              </div>
            )}

            {leaderboard.length > 0 && (
              <div className="mb-4 w-72">
                <div className="text-lg font-mono text-[hsl(var(--game-glow))] text-center mb-2">TOP SCORES</div>
                <div className="border border-[hsl(var(--game-foreground))] p-2">
                  {leaderboard.map((entry, i) => (
                    <div key={i} className={`flex justify-between font-mono text-sm py-0.5 ${
                      entry.score === displayScore && entry.initials === initials
                        ? "text-[hsl(var(--game-glow))]"
                        : "text-[hsl(var(--game-foreground))]"
                    }`}>
                      <span>{(i + 1).toString().padStart(2, " ")}. {entry.initials.padEnd(3, " ")}</span>
                      <span>{entry.score.toString().padStart(8, "0")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <Button
                onClick={initGame}
                className={`text-xl px-8 py-4 font-mono transition-all ${
                  gameOverSelection === 0
                    ? "bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] shadow-[0_0_15px_hsl(var(--game-foreground))]"
                    : "bg-[hsl(var(--game-foreground))]/20 text-[hsl(var(--game-foreground))] border border-[hsl(var(--game-foreground))]/40"
                }`}
              >
                {gameOverSelection === 0 ? "▸ " : ""}PLAY AGAIN
              </Button>
              <Button
                onClick={quitToMenu}
                variant="outline"
                className={`font-mono transition-all ${
                  gameOverSelection === 1
                    ? "border-[hsl(var(--game-foreground))] text-[hsl(var(--game-foreground))] bg-[hsl(var(--game-foreground))]/20 shadow-[0_0_15px_hsl(var(--game-foreground))]"
                    : "border-[hsl(var(--game-foreground))]/40 text-[hsl(var(--game-foreground))]/60"
                }`}
              >
                {gameOverSelection === 1 ? "▸ " : ""}MENU
              </Button>
            </div>
          </div>
        )}

        {/* Pause overlay */}
        {isPaused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 z-10">
            <div className="text-5xl font-mono text-[hsl(var(--game-foreground))] mb-8 tracking-widest animate-pulse"
              style={{ textShadow: "0 0 30px hsl(var(--game-foreground))" }}>
              PAUSED
            </div>
            <div className="flex flex-col gap-4 items-center mb-8">
              <Button
                onClick={resumeGame}
                className={`text-xl px-10 py-5 font-mono tracking-wider transition-all ${
                  pauseSelection === 0
                    ? "bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] shadow-[0_0_20px_hsl(var(--game-foreground))]"
                    : "bg-[hsl(var(--game-foreground))]/20 text-[hsl(var(--game-foreground))] border border-[hsl(var(--game-foreground))]/40"
                }`}
              >
                {pauseSelection === 0 ? "▸ " : "  "}RESUME
              </Button>
              <Button
                onClick={() => { resumeGame(); quitToMenu(); }}
                className={`text-xl px-10 py-5 font-mono tracking-wider transition-all ${
                  pauseSelection === 1
                    ? "bg-[hsl(var(--game-danger))] text-[hsl(var(--game-background))] shadow-[0_0_20px_hsl(var(--game-danger))]"
                    : "bg-[hsl(var(--game-foreground))]/10 text-[hsl(var(--game-foreground))]/60 border border-[hsl(var(--game-foreground))]/20"
                }`}
              >
                {pauseSelection === 1 ? "▸ " : "  "}QUIT TO MENU
              </Button>
            </div>
            <div className="text-[hsl(var(--game-foreground))] font-mono text-xs opacity-40">
              ESC or START to resume
            </div>
          </div>
        )}

        {/* Duel quit button */}
        {(gameMode === "duel" || gameMode === "online") && !isPaused && (
          <div className="absolute top-2 right-2">
            <Button
              onClick={quitToMenu}
              variant="outline"
              size="sm"
              className="border-[hsl(var(--game-foreground))] text-[hsl(var(--game-foreground))] hover:bg-[hsl(var(--game-foreground))]/20 font-mono text-xs opacity-50 hover:opacity-100"
            >
              QUIT
            </Button>
          </div>
        )}
      </div>

      {isTouchDevice && gameMode === "solo" && (
        <div
          className="mt-4 w-full max-w-[800px] select-none"
          style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          <div className="flex justify-between items-end px-2">
            <div className="flex gap-3">
              <button
                className="w-16 h-16 rounded-full border-2 border-[hsl(var(--game-foreground))] text-[hsl(var(--game-foreground))] font-mono text-2xl active:bg-[hsl(var(--game-foreground))]/30 flex items-center justify-center"
                onTouchStart={(e) => { e.preventDefault(); keysRef.current["ArrowLeft"] = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current["ArrowLeft"] = false; }}
                onTouchCancel={() => { keysRef.current["ArrowLeft"] = false; }}
              >
                ◄
              </button>
              <button
                className="w-16 h-16 rounded-full border-2 border-[hsl(var(--game-foreground))] text-[hsl(var(--game-foreground))] font-mono text-2xl active:bg-[hsl(var(--game-foreground))]/30 flex items-center justify-center"
                onTouchStart={(e) => { e.preventDefault(); keysRef.current["ArrowRight"] = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current["ArrowRight"] = false; }}
                onTouchCancel={() => { keysRef.current["ArrowRight"] = false; }}
              >
                ►
              </button>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-3">
                <button
                  className="w-16 h-16 rounded-full border-2 border-[hsl(var(--game-glow))] text-[hsl(var(--game-glow))] font-mono text-xs font-bold active:bg-[hsl(var(--game-glow))]/30 flex items-center justify-center shadow-[0_0_10px_hsl(var(--game-glow)/0.3)]"
                  onTouchStart={(e) => { e.preventDefault(); keysRef.current["ArrowUp"] = true; }}
                  onTouchEnd={(e) => { e.preventDefault(); keysRef.current["ArrowUp"] = false; }}
                  onTouchCancel={() => { keysRef.current["ArrowUp"] = false; }}
                >
                  THRUST
                </button>
                <button
                  className="w-16 h-16 rounded-full border-2 border-[hsl(var(--game-danger))] text-[hsl(var(--game-danger))] font-mono text-xs font-bold active:bg-[hsl(var(--game-danger))]/30 flex items-center justify-center shadow-[0_0_10px_hsl(var(--game-danger)/0.3)]"
                  onTouchStart={(e) => { e.preventDefault(); shootBullet(); keysRef.current[" "] = true; }}
                  onTouchEnd={(e) => { e.preventDefault(); keysRef.current[" "] = false; }}
                  onTouchCancel={() => { keysRef.current[" "] = false; }}
                >
                  FIRE
                </button>
              </div>
              <button
                className="w-[140px] h-10 rounded-full border-2 border-[hsl(var(--game-powerup))] text-[hsl(var(--game-powerup))] font-mono text-xs font-bold active:bg-[hsl(var(--game-powerup))]/30 flex items-center justify-center shadow-[0_0_10px_hsl(var(--game-powerup)/0.3)]"
                onTouchStart={(e) => { e.preventDefault(); hyperspace(); }}
              >
                HYPERSPACE
              </button>
            </div>
          </div>
        </div>
      )}

      {!isTouchDevice && (
        <div className="mt-4 text-[hsl(var(--game-foreground))] font-mono text-[8px] opacity-60">
          {gameMode === "solo" && (
            <div className="flex gap-10 justify-center">
              <div className="text-left space-y-0.5">
                <div className="font-bold opacity-70 mb-1">KEYBOARD</div>
                <div>← → ROTATE</div>
                <div>↑ THRUST</div>
                <div>SPACE FIRE</div>
                <div>H HYPERSPACE</div>
                <div>ESC PAUSE</div>
              </div>
              <div className="text-left space-y-0.5">
                <div className="font-bold opacity-70 mb-1">GAMEPAD</div>
                <div>STICK/DPAD MOVE</div>
                <div>X/↑ THRUST</div>
                <div>A FIRE</div>
                <div>B HYPER</div>
                <div>START PAUSE</div>
              </div>
            </div>
          )}
          {gameMode === "duel" && (
            <div className="flex gap-10 justify-center">
              <div className="text-left space-y-0.5">
                <div className="font-bold opacity-70 mb-1">KEYBOARD</div>
                <div style={{ color: P1_COLOR }}>P1: ← → ROTATE</div>
                <div style={{ color: P1_COLOR }}>P1: ↑ THRUST</div>
                <div style={{ color: P1_COLOR }}>P1: SPACE FIRE</div>
                <div style={{ color: P2_COLOR }}>P2: A D ROTATE</div>
                <div style={{ color: P2_COLOR }}>P2: W THRUST</div>
                <div style={{ color: P2_COLOR }}>P2: E FIRE</div>
                <div>ESC PAUSE</div>
              </div>
              <div className="text-left space-y-0.5">
                <div className="font-bold opacity-70 mb-1">GAMEPAD</div>
                <div style={{ color: P1_COLOR }}>P1: GP1</div>
                <div style={{ color: P2_COLOR }}>P2: GP2</div>
                <div>A FIRE</div>
                <div>B HYPER</div>
                <div>X/↑ THRUST</div>
                <div>START PAUSE</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 max-w-md">
        <div className="text-[hsl(var(--game-foreground))] font-mono text-sm text-center">
          🎵 NECTARINE DEMOSCENE RADIO
        </div>
        {nowPlaying && (
          <div className="text-[hsl(var(--game-foreground))] font-mono text-xs text-center animate-pulse">
            <span className="opacity-90">{nowPlaying.artist}</span>
            <span className="opacity-50"> — </span>
            <span className="opacity-80">{nowPlaying.title}</span>
          </div>
        )}
        <audio
          ref={audioRef}
          controls
          autoPlay
          preload="auto"
          className="w-full"
          onError={(e) => {
            const target = e.currentTarget;
            console.error("Audio loading error:", target.error?.message);
          }}
        >
          <source src="https://nectarine.inversi0n.org/necta192.mp3" type="audio/mpeg" />
        </audio>
        <div className="text-[hsl(var(--game-foreground))] font-mono text-xs text-center opacity-60 mt-1">
          Thanks to <a href="https://scenestream.net/demovibes/" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">Nectarine Demoscene Radio</a> for the music!
        </div>
        <div className="text-[hsl(var(--game-foreground))] font-mono text-[10px] text-center opacity-40 mt-0.5">
          Streaming demoscene & chiptune tracks 24/7
        </div>
      </div>

      <button
        onClick={() => navigate("/")}
        className="mt-6 px-6 py-2 font-mono text-xs text-[hsl(var(--game-foreground))] opacity-50 hover:opacity-100 transition-opacity uppercase tracking-widest"
      >
        home page
      </button>
    </div>
  );
};

export default Game;
