import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { APP_VERSION as GAME_VERSION } from "@/constants/version";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import hyperspaceIcon from "@/assets/hyperspace.png";
import bmcIcon from "@/assets/buymeacoffee.png";
import { soundEffects } from "@/utils/soundEffects";
import { haptics } from "@/utils/haptics";
import { useMultiplayer } from "@/hooks/useMultiplayer";
import OnlineLobby from "@/components/OnlineLobby";
import LobbyChat from "@/components/LobbyChat";
import PlayerList from "@/components/PlayerList";
import CRTBootOverlay from "@/components/CRTBootOverlay";
import GameOverPanel, { type CloudStatus } from "@/components/GameOverPanel";
import ControlSettings from "@/components/ControlSettings";
import ChangelogOverlay from "@/components/ChangelogOverlay";
import { loadBindings, displayKeyName, type ControlBindings } from "@/hooks/useControlSettings";
import type { DuelNetState, CoopNetState, SessionMode } from "@/types/multiplayer";
import { DEBUG_ENABLED, DEBUG_CATEGORIES, type DebugCategory, type DebugLogEntry } from "@/constants/debug";
import { SPAWN_INVULNERABILITY_FRAMES, SHIELD_DURATION, RAPID_FIRE_DURATION, MULTIPLIER_DURATION, DEFAULT_TURN_SPEED, BULLET_LIFETIME, BOSS_TYPES, BOSS_NAMES, HIGH_SCORES_ENABLED, MIN_SCORE_FOR_INITIALS, CHAIN_WINDOW, CHAIN_STEP, CHAIN_MAX, BALANCE, extraLifeThreshold, type DropSource } from "@/constants/gameConstants";
import { readGamepad as readGamepadUtil } from "@/hooks/useInput";

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
  hyperspaceCooldown: number;
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
  waveOffset: number;
  beepTimer: number;
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
  type: "brown" | "greenMan" | "blueSentinel" | "purpleSwarm";
  hp: number;
  moveTimer: number;
  shootTimer: number;
  zigzagPhase: number;
  // Red Drone specific
  dashTimer?: number;
  isDashing?: boolean;
  orbitAngle?: number;
  // Blue Sentinel specific
  invisTimer?: number;
  isInvisible?: boolean;
  burstCount?: number;
  teleportCooldown?: number;
  chargeTimer?: number;
  // Purple Swarm specific
  flockId?: number;
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
  bossType: "tentacle" | "amigaBall" | "flyingSaucer" | "borgCube";
  // Amiga Ball specific
  bounceVelX?: number;
  bounceVelY?: number;
  rotAngle?: number;
  lastBounceFrame?: number;
  // Flying Saucer specific
  tractorBeamAngle?: number;
  tractorBeamActive?: boolean;
  sweepAngle?: number;
  miniSaucerTimer?: number;
  miniSaucers?: Array<{ pos: Vector; vel: Vector; hp: number; shootTimer: number }>;
  // Borg Cube specific
  cubeRotX?: number;
  cubeRotY?: number;
  regenTimer?: number;
  gridLaserTimer?: number;
  adaptPhase?: number;
  miniCubeTimer?: number;
  miniCubes?: Array<{ pos: Vector; vel: Vector; hp: number; rotAngle: number }>;
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
  {
    name: "Classic",
    ship: "#44FF44",
    asteroids: ["#FFFFFF", "#88DDFF", "#44AAFF"],
    bg: "#050510",
    accent: "#00FF88",
    enemy: "#FFFF44",
  },
  {
    name: "Inferno",
    ship: "#44FF44",
    asteroids: ["#FF4444", "#FF8844", "#FFAA22"],
    bg: "#0A0505",
    accent: "#FF2200",
    enemy: "#FFCC00",
  },
  {
    name: "Void",
    ship: "#44FF44",
    asteroids: ["#CC88FF", "#8844CC", "#6622AA"],
    bg: "#080518",
    accent: "#FF44FF",
    enemy: "#AA88FF",
  },
  {
    name: "Solar",
    ship: "#44FF44",
    asteroids: ["#FFD700", "#FFAA00", "#FF8800"],
    bg: "#0A0800",
    accent: "#FFFF44",
    enemy: "#FFEE66",
  },
  {
    name: "Toxic",
    ship: "#FFFFFF",
    asteroids: ["#88FF88", "#44CC44", "#22AA22"],
    bg: "#030A03",
    accent: "#00FF00",
    enemy: "#AAFF44",
  },
];

interface GameState {
  extraLifeCount?: number;
  lastDropTick?: number;
  tick?: number;
  ship: Ship;
  asteroids: Asteroid[];
  bullets: Bullet[];
  ufos: UFO[];
  powerUps: PowerUp[];
  score: number;
  lives: number;
  wave: number;
  gameOver: boolean;
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
  pendingNextWave: boolean;
  chain: number;
  chainTimer: number;
  bestChain: number;
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

interface CoopState {
  ships: Ship[];
  bullets: Bullet[][];
  bossBullets: Bullet[];
  alienBullets: Bullet[];
  asteroids: Asteroid[];
  aliens: Alien[];
  ufos: UFO[];
  score: number;
  lives: number[];
  eliminated: boolean[];
  wave: number;
  respawnTimer: number[];
  powerUpActive: { shield: number; rapidFire: number; multiplier: number }[];
  hyperspaceCooldown: number[];
  powerUps: PowerUp[];
  boss: Boss | null;
  waveComplete: boolean;
  waveCompleteTimer: number;
  gameOver: boolean;
  floatingTexts: FloatingText[];
  particles: Particle[];
  stars: Star[];
  playerCount: number;
}

interface CoopPlayerStat {
  playerIndex: number;
  label: string;
  score: number;
  asteroidsDestroyed: number;
  enemiesKilled: number;
  powerUpsCollected: number;
}

type GameMode = "menu" | "solo" | "duel" | "online_lobby" | "online" | "coop" | "online_coop";

/** True for any mode where two ships are on screen (duel, coop, online variants). */
const isMultiplayerMode = (m: GameMode) => m === "duel" || m === "online" || m === "coop" || m === "online_coop";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const FIXED_TIMESTEP = 1000 / 60; // 16.666ms – game logic always runs at 60 Hz
const FRAME_MIN_TIME = FIXED_TIMESTEP; // 60 FPS render cap (tied to fixed timestep)
// Allow up to 1 ms of timing jitter when checking the FPS cap to avoid
// accidentally skipping a frame due to sub-millisecond precision drift.
const FRAME_TIME_TOLERANCE = 1;

/** Guest inputs are sent at 20 Hz (every 50 ms) to reduce channel traffic. */
const ONLINE_INPUT_SEND_INTERVAL_MS = 50;
/** Coop state is broadcast every Nth worker tick; at 60 Hz this gives ~20 Hz. */
const ONLINE_STATE_BROADCAST_TICK_INTERVAL = 3;


const LOCAL_SCORES_KEY = "asteroids_local_highscores";
interface LocalScore {
  initials: string;
  score: number;
  date: string;
}

// Set to true to re-enable the server high scores system.
// Set to true to re-enable the server high scores system (also in gameConstants.ts).
// const HIGH_SCORES_ENABLED = false; // imported from gameConstants

const SHIP_SIZE = 10;
const BULLET_SPEED = 7;
const ASTEROID_SPEEDS = { large: 0.5, medium: 0.8, small: 1.2 };
const ASTEROID_POINTS = { large: 20, medium: 50, small: 100 };
const UFO_POINTS = { large: 200, small: 1000 };
const GAMEPAD_DEADZONE = 0.2;
const MARQUEE_SPEED = 0.8; // pixels per frame (~48px/sec at 60fps)

const P1_COLOR = "#00FFFF";
const P2_COLOR = "#FF8844";
const PLAYER_COLORS = ["#00FFFF", "#FF8844", "#FF44FF", "#FFFF44", "#44FF44", "#FF4444", "#44FFFF", "#FF88FF"];

const getTheme = (wave: number): ColorTheme => {
  const idx = Math.floor((wave - 1) / 5) % COLOR_THEMES.length;
  return COLOR_THEMES[idx];
};

const getSpeedScale = (wave: number): number => 1.0 + (wave - 1) * 0.05;

// Module-level counters written by gameLoop; read by FpsOverlay via polling.
// Plain object (no React state) so there is zero overhead in Game itself.
const _fps = { frames: 0, updates: 0, lastTime: 0 };

interface FpsDisplayData {
  fps: number;
  ups: number;
  frameTime: number;
}

interface MenuButtonProps {
  label: string;
  onClick: () => void;
  variant: "primary" | "secondary" | "ghost";
  accent?: "green" | "orange";
  selected: boolean;
  badge?: string;
  subLabel?: string;
  ariaLabel?: string;
}

function MenuButton({ label, onClick, variant, accent, selected, badge, subLabel, ariaLabel }: MenuButtonProps) {
  const accentClasses =
    accent === "green"
      ? "border-[#44FF44] text-[#44FF44] shadow-[0_0_14px_rgba(68,255,68,0.22)]"
      : accent === "orange"
        ? "border-[#FF8844] text-[#FF8844] shadow-[0_0_14px_rgba(255,136,68,0.22)]"
        : "border-[hsl(var(--game-foreground))]/40 text-[hsl(var(--game-foreground))]";
  const variantClasses =
    variant === "primary"
      ? "bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] border-[hsl(var(--game-foreground))] shadow-[0_0_18px_hsl(var(--game-foreground)/0.35)]"
      : variant === "ghost"
        ? "h-11 border-[hsl(var(--game-foreground))]/40 text-sm text-[hsl(var(--game-foreground))]"
        : accentClasses;

  return (
    <Button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={`relative w-full ${variant === "ghost" ? "h-11 text-sm" : "h-14 text-lg"} rounded-md border-2 bg-transparent font-mono tracking-wider motion-safe:transition-transform active:scale-[0.98] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--game-background))] ${variantClasses} ${selected ? "brightness-125" : ""}`}
    >
      <span aria-hidden="true" className="absolute left-4 w-4 text-left">
        {selected ? "▸" : ""}
      </span>
      <span>{label}</span>
      {(badge || subLabel) && (
        <span
          className={`absolute right-3 text-[10px] ${badge ? "rounded border border-[hsl(var(--game-danger))] px-1.5 py-0.5 text-[hsl(var(--game-danger))]" : "opacity-80"}`}
        >
          {badge ?? subLabel}
        </span>
      )}
    </Button>
  );
}

interface RadioMiniPlayerProps {
  audioRef: RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  nowPlaying: { artist: string; title: string } | null;
  autoPlayMusic: boolean;
  onToggleAutoPlay: () => void;
  onPauseGame?: () => void;
}

function RadioMiniPlayer({
  audioRef,
  isPlaying,
  nowPlaying,
  autoPlayMusic,
  onToggleAutoPlay,
  onPauseGame,
}: RadioMiniPlayerProps) {
  return (
    <div className="h-11 w-full max-w-[800px] flex shrink-0 items-center gap-2 rounded-md border border-border/60 bg-[hsl(var(--game-background))]/80 px-2 font-mono">
      <button
        type="button"
        aria-label={isPlaying ? "Pause radio" : "Play radio"}
        aria-pressed={isPlaying}
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) audio.play().catch(() => {});
          else audio.pause();
        }}
        className="relative h-9 w-9 shrink-0 rounded border border-[hsl(var(--game-foreground))]/60 text-[hsl(var(--game-foreground))] before:absolute before:-inset-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span aria-hidden="true">{isPlaying ? "❚❚" : "▶"}</span>
      </button>
      <a
        href="https://scenestream.net/demovibes/"
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-[10px] text-[hsl(var(--game-foreground))] opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        ♪ {nowPlaying ? `${nowPlaying.artist} – ${nowPlaying.title}` : "NECTARINE RADIO"}
      </a>
      <button
        type="button"
        aria-label="Automatic radio playback"
        aria-pressed={autoPlayMusic}
        onClick={onToggleAutoPlay}
        className={`relative h-8 min-w-[52px] shrink-0 rounded border px-2 text-[10px] before:absolute before:-inset-y-1.5 before:inset-x-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          autoPlayMusic
            ? "border-[hsl(var(--game-foreground))] bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))]"
            : "border-[hsl(var(--game-foreground))]/60 text-[hsl(var(--game-foreground))]"
        }`}
      >
        AUTO
      </button>
      {onPauseGame && (
        <button
          type="button"
          aria-label="Pause"
          onClick={onPauseGame}
          className="relative h-9 w-9 shrink-0 rounded border border-[hsl(var(--game-foreground))]/60 text-[hsl(var(--game-foreground))] before:absolute before:-inset-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span aria-hidden="true">⏸</span>
        </button>
      )}
    </div>
  );
}

function FpsOverlay() {
  const [data, setData] = useState<FpsDisplayData>({ fps: 0, ups: 0, frameTime: 0 });
  useEffect(() => {
    _fps.lastTime = performance.now();
    _fps.frames = 0;
    _fps.updates = 0;
    const id = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - _fps.lastTime) / 1000;
      if (elapsed > 0) {
        setData({
          fps: Math.round(_fps.frames / elapsed),
          ups: Math.round(_fps.updates / elapsed),
          frameTime: _fps.frames > 0 ? (elapsed / _fps.frames) * 1000 : 0,
        });
      }
      _fps.frames = 0;
      _fps.updates = 0;
      _fps.lastTime = now;
    }, 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="absolute bottom-1 left-1 z-50 bg-black/40 text-[#00FF00]/60 font-mono text-[9px] px-1.5 py-0.5 rounded pointer-events-none leading-tight">
      <span>FPS: {data.fps}</span>
      <span className="ml-2 opacity-60">{data.frameTime.toFixed(1)}ms</span>
    </div>
  );
}

const Game = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const duelStateRef = useRef<DuelState | null>(null);
  const coopStateRef = useRef<CoopState | null>(null);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const animationFrameRef = useRef<number>();
  const drawTimestampRef = useRef<number>(0);
  const lastShotRef = useRef(0);
  const lastShotP2Ref = useRef(0);
  const enteringInitialsRef = useRef(false);
  const submissionGenerationRef = useRef(0);
  const submittingScoreRef = useRef(false);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(3);
  const [displayWave, setDisplayWave] = useState(1);
  const [showGameOver, setShowGameOver] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [enteringInitials, setEnteringInitials] = useState(false);
  const [initials, setInitials] = useState(() => {
    try {
      const stored = localStorage.getItem("playerInitials");
      return stored ? stored.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : "";
    } catch {
      return "";
    }
  });
  const [initialsError, setInitialsError] = useState("");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("idle");
  const [leaderboard, setLeaderboard] = useState<{ initials: string; score: number; date: string }[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(HIGH_SCORES_ENABLED);
  const [scoreTab, setScoreTab] = useState<"global" | "local">(HIGH_SCORES_ENABLED ? "global" : "local");
  
  const [oldLeaderboard, setOldLeaderboard] = useState<{ initials: string; score: number; date: string }[]>([]);
  const [showOldLeaderboard, setShowOldLeaderboard] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const controlBindingsRef = useRef<ControlBindings>(loadBindings());
  const [showLifeLost, setShowLifeLost] = useState(false);
  const showLifeLostRef = useRef(false);
  const gameSessionTokenRef = useRef<string | null>(null);
  const gameStartTimeRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const powSolutionRef = useRef<number | null>(null);
  const powPromiseRef = useRef<Promise<number> | null>(null);
  const sessionNonceRef = useRef<string | null>(null);
  const gameStatsRef = useRef({ asteroidsDestroyed: 0, bulletsFired: 0 });
  const heartbeatSeqRef = useRef(0);
  const pendingSubmissionRef = useRef<{
    token: string;
    nonce: string | null;
    score: number;
    wave: number;
    asteroidsDestroyed: number;
    bulletsFired: number;
    seq: number;
  } | null>(null);
  const pendingInitialsRef = useRef("");
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [canUseKeyboard, setCanUseKeyboard] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(any-pointer: fine)").matches,
  );
  const [nowPlaying, setNowPlaying] = useState<{ artist: string; title: string } | null>(null);
  const nowPlayingRef = useRef<{ artist: string; title: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    const audio = new Audio("https://nectarine.inversi0n.org/necta192.mp3");
    audio.preload = "none";
    audioRef.current = audio;
  }
  const [isRadioPlaying, setIsRadioPlaying] = useState(() => audioRef.current !== null && !audioRef.current.paused);
  const [quitConfirm, setQuitConfirm] = useState(false);
  const quitConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>("menu");
  const gameModeRef = useRef<GameMode>("menu");
  const [showBootAnimation, setShowBootAnimation] = useState(true);
  const [duelKills, setDuelKills] = useState<[number, number]>([0, 0]);
  const [duelDeaths, setDuelDeaths] = useState<[number, number]>([0, 0]);
  const [coopScore, setCoopScore] = useState(0);
  const [coopWave, setCoopWave] = useState(1);
  const [coopLives, setCoopLives] = useState<number[]>([3, 3]);
  const [coopPlayerCount, setCoopPlayerCount] = useState(2);
  const [coopEliminated, setCoopEliminated] = useState<boolean[]>([false, false]);
  const [coopGameOver, setCoopGameOver] = useState(false);
  const [coopWaveComplete, setCoopWaveComplete] = useState(false);
  const [coopPlayerStats, setCoopPlayerStats] = useState<CoopPlayerStat[]>([]);
  const [hostRestarted, setHostRestarted] = useState(false);
  const [isSpectating, setIsSpectating] = useState(false);
  const [coopGeneration, setCoopGeneration] = useState(0);
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);
  const restartDeadlineRef = useRef<number | null>(null);
  // Incremented each time a new countdown session starts; used as the dependency
  // for the setInterval-based countdown effect to avoid stale-closure issues.
  const [countdownKey, setCountdownKey] = useState(0);
  // Tracks which guest playerIdx values have pressed READY for the current restart
  const readyPlayerIdxsRef = useRef<Set<number>>(new Set());
  // Number of guests expected to press ready (set when host triggers restart)
  const expectedGuestsForRestartRef = useRef(0);
  // Authoritative player count from the last coop worker state (includes mid-game additions)
  const lastCoopPlayerCountRef = useRef(0);
  const coopGenerationRef = useRef(0);
  const [menuSelection, setMenuSelection] = useState(0); // 0=solo, 1=duel, 2=coop, 3=online, 4=settings
  const [gameOverSelection, setGameOverSelection] = useState(0); // 0=play again, 1=menu
  const gameOverSelectionRef = useRef(0);
  const runStartTimeRef = useRef<number>(Date.now());
  const [runSummary, setRunSummary] = useState<{
    score: number;
    wave: number;
    timeSurvived: number;
    accuracy: number | null;
    asteroids: number;
    bestChain: number;
    prevBest: { score: number; wave: number; timeSurvived: number; accuracy: number | null } | null;
  } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [pauseSelection, setPauseSelection] = useState(0); // 0=resume, 1=quit
  const prevGamepadButtonRef = useRef<boolean[]>([false, false, false, false, false, false, false]);
  const [autoPlayMusic, setAutoPlayMusic] = useState(() => {
    const stored = localStorage.getItem("autoPlayMusic");
    return stored === "true";
  });
  const [hyperChargePercent, setHyperChargePercent] = useState(100);
  const hyperChargeReadyRef = useRef(true);
  const onelinerGifsRef = useRef<Record<string, HTMLImageElement>>({});
  const [userPaused, setUserPaused] = useState(false);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [localHighScores, setLocalHighScores] = useState<LocalScore[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_SCORES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const radioStartedRef = useRef(false);
  const onelinerRef = useRef<{ author: string; message: string; flag: string }[] | null>(null);
  const lastOnelinerTimeRef = useRef<string>("");
  const olTextCacheRef = useRef<{ text: string; totalWidth: number } | null>(null);
  const nowPlayingTextCacheRef = useRef<{ text: string; width: number } | null>(null);
  const chainTextCacheRef = useRef<{ text: string; width: number } | null>(null);

  // Debug-only layout-shift detector
  useEffect(() => {
    if (!DEBUG_ENABLED || typeof PerformanceObserver === "undefined") return;
    interface LayoutShiftEntry extends PerformanceEntry { value: number; hadRecentInput: boolean; sources?: unknown[] }
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as LayoutShiftEntry[]) {
          if (!e.hadRecentInput && e.value > 0.001) console.warn("[layout-shift]", e.value.toFixed(4), e.sources);
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch { /* unsupported */ }
    return () => observer?.disconnect();
  }, []);
  const nowPlayingMarqueeXRef = useRef<number>(CANVAS_WIDTH);
  const onelinerMarqueeXRef = useRef<number>(CANVAS_WIDTH);

  // Cached offscreen canvases & gradients for performance
  const scanlineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const menuScanlineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vignetteGradientRef = useRef<CanvasGradient | null>(null);
  const menuVignetteGradientRef = useRef<CanvasGradient | null>(null);
  const marqueeGradientRef = useRef<CanvasGradient | null>(null);
  const olMarqueeGradientRef = useRef<CanvasGradient | null>(null);
  const cachedCanvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  // Pre-rendered Amiga Ball boss cache (avoids ~1100 fillRect calls per frame)
  const amigaBallCacheRef = useRef<{ canvas: OffscreenCanvas; lastRotAngle: number; lastHitFlash: boolean } | null>(null);
  // Pre-rendered star layer canvases (one per parallax layer, avoids 120 arc() calls/frame)
  const starLayerCanvasesRef = useRef<(OffscreenCanvas | null)[]>([null, null, null]);
  const starLayerStarsRef = useRef<Star[]>([]);

  // Build or rebuild cached overlays when canvas size changes
  const ensureCachedOverlays = useCallback((ctx: CanvasRenderingContext2D) => {
    const w = CANVAS_WIDTH;
    const h = CANVAS_HEIGHT;
    if (cachedCanvasSize.current.w === w && cachedCanvasSize.current.h === h && scanlineCanvasRef.current) return;
    cachedCanvasSize.current = { w, h };

    // Main CRT scanline overlay (every 4px)
    const sc = document.createElement("canvas");
    sc.width = w;
    sc.height = h;
    const sctx = sc.getContext("2d")!;
    sctx.fillStyle = "#000000";
    for (let y = 0; y < h; y += 4) {
      sctx.fillRect(0, y, w, 1);
    }
    scanlineCanvasRef.current = sc;

    // Menu scanline overlay (every 6px)
    const msc = document.createElement("canvas");
    msc.width = w;
    msc.height = h;
    const msctx = msc.getContext("2d")!;
    msctx.fillStyle = "#000000";
    for (let y = 0; y < h; y += 6) {
      msctx.fillRect(0, y, w, 1);
    }
    menuScanlineCanvasRef.current = msc;

    // Main vignette gradient
    vignetteGradientRef.current = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.9);
    vignetteGradientRef.current.addColorStop(0, "rgba(0,0,0,0)");
    vignetteGradientRef.current.addColorStop(1, "rgba(0,0,0,0.35)");

    // Menu vignette gradient
    menuVignetteGradientRef.current = ctx.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, h * 0.8);
    menuVignetteGradientRef.current.addColorStop(0, "rgba(0,0,0,0)");
    menuVignetteGradientRef.current.addColorStop(1, "rgba(0,0,0,0.3)");

    // Now-playing marquee gradient
    marqueeGradientRef.current = ctx.createLinearGradient(0, h - 30, 0, h);
    marqueeGradientRef.current.addColorStop(0, "rgba(0, 150, 255, 0)");
    marqueeGradientRef.current.addColorStop(0.5, "rgba(0, 150, 255, 0.15)");
    marqueeGradientRef.current.addColorStop(1, "rgba(0, 150, 255, 0.05)");

    // Oneliner marquee gradient
    olMarqueeGradientRef.current = ctx.createLinearGradient(0, 18, 0, 40);
    olMarqueeGradientRef.current.addColorStop(0, "rgba(255, 180, 0, 0)");
    olMarqueeGradientRef.current.addColorStop(0.5, "rgba(255, 180, 0, 0.12)");
    olMarqueeGradientRef.current.addColorStop(1, "rgba(255, 180, 0, 0)");
  }, []);

  // Debug system state (only active when DEBUG_ENABLED is true)
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const debugLogsRef = useRef<DebugLogEntry[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugCategories, setDebugCategories] = useState<Set<DebugCategory>>(new Set(DEBUG_CATEGORIES));
  const [trainerMode, setTrainerMode] = useState(() => {
    if (!DEBUG_ENABLED) return false;
    return localStorage.getItem("trainerMode") === "true";
  });
  const trainerModeRef = useRef(trainerMode);

  // Online multiplayer state
  const multiplayer = useMultiplayer();
  const workerRef = useRef<Worker | null>(null);
  const broadcastTickRef = useRef(0);
  const isHostRef = useRef(false);
  const isConnectedRef = useRef(false);
  // Stable refs for use in setInterval / event callbacks (avoids stale closures)
  const coopPlayerCountRef = useRef(2);
  const hostRestartedRef = useRef(false);
  // initCoop and initOnlineCoop are defined later; their refs are populated by effects below.
  const initCoopRef = useRef<(isOnlineHost?: boolean, playerCount?: number) => void>(() => {});
  const initOnlineCoopRef = useRef<(isHost: boolean, playerCount?: number) => void>(() => {});
  // Client-side prediction: guest runs local physics for its own ship (P2)
  // to eliminate the feel of input lag between sends and authoritative state updates.
  const guestPredictedShipRef = useRef<Ship | null>(null);

  // Throttle refs for online co-op: limit broadcast and input-send rates to 20 Hz
  const netBroadcastTickRef = useRef(0);
  const lastInputSentRef = useRef(0);

  // Sound state tracking for co-op modes (thrust, fire, hyperspace)
  const prevCoopThrustRef = useRef(false);
  const prevCoopFireRef = useRef(false);
  const prevCoopHyperspaceRef = useRef(false);

  // Fixed timestep game loop timing
  const accumulatorRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  // Keep ref in sync
  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);
  useEffect(() => {
    trainerModeRef.current = trainerMode;
  }, [trainerMode]);
  useEffect(() => {
    if (DEBUG_ENABLED) localStorage.setItem("trainerMode", String(trainerMode));
  }, [trainerMode]);
  useEffect(() => {
    coopPlayerCountRef.current = coopPlayerCount;
  }, [coopPlayerCount]);
  useEffect(() => {
    hostRestartedRef.current = hostRestarted;
  }, [hostRestarted]);

  const addDebugLog = useCallback((category: DebugCategory, message: string) => {
    if (!DEBUG_ENABLED) return;
    const entry: DebugLogEntry = { timestamp: Date.now(), category, message };
    debugLogsRef.current = [...debugLogsRef.current.slice(-199), entry];
    setDebugLogs(debugLogsRef.current);
  }, []);

  const loadLeaderboard = useCallback(async () => {
    const { data, error } = await supabase
      .from("current_high_scores")
      .select("initials, score, created_at")
      .order("score", { ascending: false })
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


  const loadOldLeaderboard = useCallback(async () => {
    const { data, error } = await supabase
      .from("high_scores")
      .select("initials, score, created_at")
      .order("score", { ascending: false })
      .limit(30);
    if (!error && data) {
      return data.map((row) => ({
        initials: row.initials,
        score: row.score,
        date: new Date(row.created_at).toLocaleDateString(),
      }));
    }
    return [];
  }, []);

  // --- Crypto helpers for anti-cheat ---
  const solvePoW = useCallback((challenge: string, difficulty: number): Promise<number> => {
    const solveOnMainThread = async () => {
      let nonce = 0;
      while (true) {
        const data = new TextEncoder().encode(challenge + nonce.toString());
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = new Uint8Array(hashBuffer);
        let zeroBits = 0;
        let found = false;
        for (const byte of hashArray) {
          if (byte === 0) {
            zeroBits += 8;
          } else {
            for (let bit = 7; bit >= 0; bit--) {
              if ((byte & (1 << bit)) === 0) zeroBits++;
              else {
                found = true;
                break;
              }
            }
          }
          if (found || zeroBits >= difficulty) break;
        }
        if (zeroBits >= difficulty) return nonce;
        nonce++;
        if (nonce % 1000 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    };

    if (HIGH_SCORES_ENABLED && typeof Worker !== "undefined") {
      try {
        return new Promise((resolve) => {
          const worker = new Worker(new URL("../workers/powWorker.ts", import.meta.url), { type: "module" });
          worker.onmessage = (e: MessageEvent<{ nonce: number }>) => {
            worker.terminate();
            resolve(e.data.nonce);
          };
          worker.onerror = () => {
            worker.terminate();
            void solveOnMainThread().then(resolve);
          };
          worker.postMessage({ challenge, difficulty });
        });
      } catch {
        return solveOnMainThread();
      }
    }
    return solveOnMainThread();
  }, []);

  const computeHMAC = useCallback(async (key: string, message: string): Promise<string> => {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }, []);

  const startGameSession = useCallback(async () => {
    gameSessionTokenRef.current = null;
    sessionNonceRef.current = null;
    powSolutionRef.current = null;
    powPromiseRef.current = null;
    heartbeatSeqRef.current = 0;
    gameStatsRef.current = { asteroidsDestroyed: 0, bulletsFired: 0 };

    const generation = submissionGenerationRef.current;
    const retryDelays = [500, 2000, 5000];
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      const runEnded = gameStateRef.current?.gameOver ?? true;
      if (submissionGenerationRef.current !== generation || runEnded) return null;
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt - 1]));
        const endedDuringDelay = gameStateRef.current?.gameOver ?? true;
        if (submissionGenerationRef.current !== generation || endedDuringDelay) return null;
      }

      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit/start-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        if (!response.ok) {
          console.warn("Failed to start game session:", response.status);
          continue;
        }

        const data = await response.json();
        const endedBeforeStore = gameStateRef.current?.gameOver ?? true;
        if (submissionGenerationRef.current !== generation || endedBeforeStore) return null;
        gameSessionTokenRef.current = data.sessionToken;
        sessionNonceRef.current = data.sessionNonce || null;

        if (data.challenge && data.difficulty) {
          const powPromise = solvePoW(data.challenge, data.difficulty);
          powPromiseRef.current = powPromise;
          void powPromise.then((nonce) => {
            if (submissionGenerationRef.current === generation) powSolutionRef.current = nonce;
          });
        }
        return data.sessionToken;
      } catch (error) {
        console.warn("Error starting game session:", error);
      }
    }
    return null;
  }, [solvePoW]);

  const sendHeartbeat = useCallback(async (force = false) => {
    const token = gameSessionTokenRef.current;
    const state = gameStateRef.current;
    if (!token || !state || (!force && (state.gameOver || isPausedRef.current))) return;
    try {
      const score = state.score;
      const level = state.wave;
      const { asteroidsDestroyed, bulletsFired } = gameStatsRef.current;

      // Increment seq BEFORE HMAC so seq is bound into the signature
      heartbeatSeqRef.current += 1;
      const seq = heartbeatSeqRef.current;

      // Compute HMAC with seq included (V2 format)
      let hmac: string | undefined;
      if (sessionNonceRef.current) {
        hmac = await computeHMAC(
          sessionNonceRef.current,
          `${token}|${score}|${level}|${asteroidsDestroyed}|${bulletsFired}|${seq}`,
        );
      }

      const request = () => fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit/heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ gameSessionToken: token, score, level, asteroidsDestroyed, bulletsFired, hmac, seq }),
        });

      let response: Response;
      try {
        response = await request();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        response = await request();
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        console.warn("[heartbeat]", response.status, body.error);
      }
    } catch (error) {
      console.warn("[heartbeat]", "NETWORK", error);
    }
  }, [computeHMAC]);

  const startHeartbeatInterval = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);
  }, [sendHeartbeat]);

  const stopHeartbeatInterval = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const saveToLeaderboard = useCallback(
    async (playerInitials: string): Promise<{ ok: boolean; code?: string; validation?: string }> => {
      // Trainer mode: don't save scores
      if (DEBUG_ENABLED && trainerModeRef.current) {
        console.log("Trainer mode: score not saved");
        // Return true to close dialog and proceed - trainer mode is for practice only
        return { ok: true };
      }

      const snapshot = pendingSubmissionRef.current;
      if (!snapshot?.token) {
        console.error("No game session token available");
        return { ok: false, code: "NETWORK" };
      }

      const timePlayedSeconds = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);

      if (powPromiseRef.current && powSolutionRef.current === null) {
        await Promise.race([
          powPromiseRef.current.catch(() => undefined),
          new Promise<undefined>((resolve) => setTimeout(resolve, 20000)),
        ]);
      }
      if (powPromiseRef.current && powSolutionRef.current === null) return { ok: false, code: "POW" };

      // Compute HMAC for submission — sign ALL validated fields
      let hmac: string | undefined;
      if (snapshot.nonce) {
        hmac = await computeHMAC(
          snapshot.nonce,
          `${snapshot.token}|${snapshot.score}|${snapshot.wave}|${snapshot.asteroidsDestroyed}|${snapshot.bulletsFired}|${snapshot.seq}`,
        );
      }

      const retryDelays = [2000, 6000];
      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt - 1]));
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            initials: playerInitials.toUpperCase(),
            score: snapshot.score,
            gameSessionToken: snapshot.token,
            timestamp: Date.now(),
            level: snapshot.wave,
            timePlayedSeconds,
            source: "game_client",
            powNonce: powSolutionRef.current,
            hmac,
            asteroidsDestroyed: snapshot.asteroidsDestroyed,
            bulletsFired: snapshot.bulletsFired,
            seq: snapshot.seq,
          }),
        });

          const result = await response.json().catch(() => ({}));

            if (!response.ok) {
              console.error("Failed to save score:", result.error || "Unknown error");
              if (response.status === 400 && result.error === "Please choose different initials") {
                return { ok: false, validation: result.error };
              }
              if (response.status === 409 || result.code === "MAX_SUBMISSIONS") {
                // The submission slot may already have been claimed by a lost response
                // (request reached the server, reply never arrived). If the score is
                // on the board, treat it as saved.
                const board = await loadLeaderboard();
                setLeaderboard(board);
                const exists = board.some(
                  (row) => row.initials === playerInitials.toUpperCase() && row.score === snapshot.score,
                );
                if (exists) return { ok: true };
              }
              if (response.status >= 500 && attempt < retryDelays.length) continue;
              const rawCode = typeof result.code === "string" ? result.code : typeof result.error === "string" ? result.error : String(response.status);
              return { ok: false, code: rawCode.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 12) || String(response.status) };
            }

          const board = await loadLeaderboard();
          setLeaderboard(board);
          return { ok: true };
        } catch (error) {
          console.error("Error saving score:", error);
          if (attempt >= retryDelays.length) return { ok: false, code: "NETWORK" };
        }
      }
      return { ok: false, code: "NETWORK" };
    },
    [loadLeaderboard, computeHMAC],
  );

  const isLocalHighScore = useCallback(
    (score: number) => {
      if (DEBUG_ENABLED) return true;
      if (score < MIN_SCORE_FOR_INITIALS) return false;
      return localHighScores.length < 10 || score > (localHighScores[localHighScores.length - 1]?.score ?? 0);
    },
    [localHighScores],
  );

  const isCloudHighScore = useCallback(
    (score: number) => {
      if (!HIGH_SCORES_ENABLED) return false;
      if (leaderboard.length === 0) return true;
      return leaderboard.length < 10 || score > (leaderboard[leaderboard.length - 1]?.score ?? 0);
    },
    [leaderboard],
  );

  const shouldPromptForInitials = useCallback(
    (score: number) => isLocalHighScore(score) || isCloudHighScore(score),
    [isLocalHighScore, isCloudHighScore],
  );

  const submitInitials = useCallback(
    async (inits: string, score: number) => {
      if (submittingScoreRef.current) return;
      const normalized = inits.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
      if (normalized.length === 0) return;

      // Persist remembered initials
      localStorage.setItem("playerInitials", normalized);

      // Update local leaderboard synchronously
      const updated = [
        ...localHighScores,
        { initials: normalized, score, date: new Date().toISOString() },
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(updated));
      setLocalHighScores(updated);

      // Close form immediately
      setEnteringInitials(false);
      enteringInitialsRef.current = false;
      setInitialsError("");

      if (!isCloudHighScore(score) || !pendingSubmissionRef.current?.token) {
        // No cloud session could be started for this run — save locally only.
        setCloudStatus("local");
        return;
      }

      const generation = submissionGenerationRef.current;
      pendingInitialsRef.current = normalized;
      submittingScoreRef.current = true;
      setCloudStatus("saving");
      const result = await saveToLeaderboard(normalized);
      if (submissionGenerationRef.current !== generation) return;
      submittingScoreRef.current = false;
      if (result.ok) {
        setCloudStatus("saved");
      } else if (result.validation) {
        setCloudStatus("idle");
        setInitialsError(result.validation);
      } else {
        const code = (result.code ?? "NETWORK").toUpperCase().slice(0, 12);
        setInitialsError(`CLOUD SAVE FAILED: ${code}`);
        setCloudStatus("failed");
      }
    },
    [localHighScores, isCloudHighScore, saveToLeaderboard],
  );

  const retryCloudSubmission = useCallback(async () => {
    if (submittingScoreRef.current || !pendingSubmissionRef.current || !pendingInitialsRef.current) return;
    const generation = submissionGenerationRef.current;
    submittingScoreRef.current = true;
    setInitialsError("");
    setCloudStatus("saving");
    const result = await saveToLeaderboard(pendingInitialsRef.current);
    if (submissionGenerationRef.current !== generation) return;
    submittingScoreRef.current = false;
    if (result.ok) {
      setCloudStatus("saved");
    } else if (result.validation) {
      setCloudStatus("idle");
      setInitialsError(result.validation);
    } else {
      const code = (result.code ?? "NETWORK").toUpperCase().slice(0, 12);
      setInitialsError(`CLOUD SAVE FAILED: ${code}`);
      setCloudStatus("failed");
    }
  }, [saveToLeaderboard]);

  useEffect(() => {
    loadLeaderboard()
      .then((board) => {
        setLeaderboard(board);
        if (board.length === 0) setScoreTab("local");
      })
      .finally(() => setLeaderboardLoading(false));
  }, [loadLeaderboard]);

  useEffect(() => {
    if (gameMode !== "menu") return;
    const closeMenuDialog = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showFullLeaderboard) setShowFullLeaderboard(false);
      else if (showOldLeaderboard) setShowOldLeaderboard(false);
      else if (showChangelog) setShowChangelog(false);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", closeMenuDialog);
    return () => window.removeEventListener("keydown", closeMenuDialog);
  }, [gameMode, showFullLeaderboard, showOldLeaderboard, showChangelog]);

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
    rotationSpeed: controlBindingsRef.current.turnSpeed || DEFAULT_TURN_SPEED,
    thrust: 0.08,
    isThrusting: false,
    invulnerable: true,
    invulnerableTime: SPAWN_INVULNERABILITY_FRAMES,
    hyperspaceCooldown: 0,
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
    const variance = size === "large" ? 0.3 + Math.random() * 1.2 : 0.8 + Math.random() * 0.4;
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
      waveOffset: Math.random() * Math.PI * 2,
      beepTimer: 120 + Math.random() * 60,
    };
  };

  const createAlien = (type: Alien["type"], wave: number): Alien => {
    const side = Math.random() < 0.5 ? -20 : CANVAS_WIDTH + 20;
    const dir = side < 0 ? 1 : -1;

    if (type === "blueSentinel") {
      return {
        pos: { x: side, y: 30 + Math.random() * (CANVAS_HEIGHT - 60) },
        vel: { x: dir * 0.5, y: 0 },
        rotation: 0,
        type,
        hp: 2,
        moveTimer: 0,
        shootTimer: 60 + Math.random() * 40,
        zigzagPhase: 0,
        invisTimer: 0,
        isInvisible: false,
        burstCount: 0,
        teleportCooldown: 90 + Math.random() * 60,
        chargeTimer: 0,
      };
    }
    if (type === "purpleSwarm") {
      return {
        pos: { x: side, y: 30 + Math.random() * (CANVAS_HEIGHT - 60) },
        vel: { x: dir * (0.4 + Math.random() * 0.3) * getSpeedScale(wave), y: (Math.random() - 0.5) * 1 },
        rotation: 0,
        type,
        hp: 1,
        moveTimer: 0,
        shootTimer: 9999,
        zigzagPhase: Math.random() * Math.PI * 2,
        flockId: Math.floor(Math.random() * 1000),
      };
    }

    // Original brown / greenMan
    const speed =
      type === "brown"
        ? (2 + Math.random() * 1.5) * getSpeedScale(wave)
        : (0.8 + Math.random() * 0.4) * getSpeedScale(wave);
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

  // Spawn a group of purple swarm aliens
  const spawnPurpleSwarmGroup = (wave: number) => {
    const fId = Math.floor(Math.random() * 10000);
    const side = Math.random() < 0.5 ? -20 : CANVAS_WIDTH + 20;
    const baseY = 60 + Math.random() * (CANVAS_HEIGHT - 120);
    const aliens: Alien[] = [];
    for (let i = 0; i < 3; i++) {
      const a = createAlien("purpleSwarm", wave);
      a.pos.x = side;
      a.pos.y = baseY + (i - 1) * 25;
      a.flockId = fId;
      aliens.push(a);
    }
    return aliens;
  };

  const createBoss = (wave: number): Boss => {
    // Determine boss type based on wave: 5=amigaBall, 10=flyingSaucer, 15=tentacle, 20=borgCube, then cycle
    const bossIndex = Math.floor((wave / 5 - 1) % 4); // 0,1,2,3
    const bossType = (BOSS_TYPES[bossIndex] ?? "tentacle") as Boss["bossType"];
    const baseHp = 3 + wave;

    const base: Boss = {
      pos: { x: CANVAS_WIDTH / 2, y: -80 },
      vel: { x: 0, y: 1 },
      rotation: 0,
      hp: baseHp,
      maxHp: baseHp,
      tentacles: Math.min(4 + Math.floor(wave / 5), 8),
      shootTimer: 120,
      hitFlash: 0,
      phase: 0,
      entered: false,
      targetY: 100 + Math.random() * 60,
      bossType,
    };

    if (bossType === "amigaBall") {
      base.hp = Math.floor(baseHp * 1.2);
      base.maxHp = base.hp;
      base.bounceVelX = 1 + Math.random() * 1;
      base.bounceVelY = -3;
      base.rotAngle = 0;
      base.lastBounceFrame = 0;
      base.targetY = 150;
    } else if (bossType === "flyingSaucer") {
      base.hp = Math.floor(baseHp * 1.5);
      base.maxHp = base.hp;
      base.tractorBeamAngle = 0;
      base.tractorBeamActive = false;
      base.sweepAngle = 0;
      base.miniSaucerTimer = 300;
      base.miniSaucers = [];
      base.targetY = 120;
    } else if (bossType === "borgCube") {
      base.hp = Math.floor(baseHp * 1.8);
      base.maxHp = base.hp;
      base.cubeRotX = 0;
      base.cubeRotY = 0;
      base.regenTimer = 0;
      base.gridLaserTimer = 180;
      base.adaptPhase = 0;
      base.targetY = 130;
      base.miniCubeTimer = 300 + Math.random() * 180;
      base.miniCubes = [];
    }

    return base;
  };

  const pickWeighted = <T extends string>(weights: Record<T, number>): T => {
    const entries = Object.entries(weights) as [T, number][];
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
    return entries[entries.length - 1][0];
  };

  const createPowerUp = (x: number, y: number, source: DropSource): PowerUp | null => {
    const st = gameStateRef.current;
    const tick = st?.tick ?? 0;
    if (st) {
      if (st.powerUps.length >= BALANCE.MAX_POWERUPS_ON_SCREEN) return null;
      if (tick - (st.lastDropTick ?? -Infinity) < BALANCE.DROP_COOLDOWN_TICKS) return null;
    }
    if (Math.random() >= BALANCE.DROP_RATE[source]) return null;
    if (st) st.lastDropTick = tick;
    const type: PowerUp["type"] = pickWeighted(BALANCE.DROP_WEIGHTS);
    return {
      pos: { x, y },
      vel: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 },
      rotation: 0,
      type,
      lifetime: 300,
    };
  };

  // ===== Gamepad helpers =====
  const readGamepad = (
    index: number,
  ): { left: boolean; right: boolean; up: boolean; fire: boolean; hyperspace: boolean } => {
    return readGamepadUtil(index, controlBindingsRef.current);
  };

  const checkVersion = useCallback(() => {
    const storedVersion = localStorage.getItem("gameVersion");
    if (storedVersion !== GAME_VERSION) {
      localStorage.setItem("gameVersion", GAME_VERSION);
    }
  }, []);

  const initGame = useCallback(() => {
    keysRef.current = {};
    const asteroids: Asteroid[] = [];
    for (let i = 0; i < 4; i++) {
      let x: number, y: number, dist: number;
      let retries = 0;
      do {
        x = Math.random() * CANVAS_WIDTH;
        y = Math.random() * CANVAS_HEIGHT;
        dist = Math.hypot(x - CANVAS_WIDTH / 2, y - CANVAS_HEIGHT / 2);
        retries++;
      } while (dist <= 100 && retries < 100);
      if (dist > 100) {
        asteroids.push(createAsteroid(x, y, "large", 1));
      }
    }

    gameStateRef.current = {
      ship: createShip(),
      asteroids,
      bullets: [],
      ufos: [],
      powerUps: [],
      score: 0,
      extraLifeCount: 0,
      lastDropTick: -Infinity,
      tick: 0,
      lives: 3,
      wave: 1,
      gameOver: false,
      powerUpActive: { shield: 0, rapidFire: 0, multiplier: 0 },
      floatingTexts: [],
      particles: [],
      stars: createStars(),
      ufoSpawnTimer: 900 + Math.random() * 600,
      aliens: [],
      boss: null,
      alienSpawnTimer: 600,
      bossDefeated: false,
      pendingNextWave: false,
      chain: 0,
      chainTimer: 0,
      bestChain: 0,
    };
    runStartTimeRef.current = Date.now();
    setRunSummary(null);

    duelStateRef.current = null;
    submissionGenerationRef.current += 1;
    submittingScoreRef.current = false;
    pendingSubmissionRef.current = null;
    pendingInitialsRef.current = "";
    setCloudStatus("idle");
    setDisplayScore(0);
    setDisplayLives(3);
    setDisplayWave(1);
    setShowGameOver(false);
    setEnteringInitials(false);
    setInitialsError("");
    setShowLeaderboard(false);
    setShowLifeLost(false);
    showLifeLostRef.current = false;
    setGameMode("solo");
    checkVersion();
    // Start a new game session for secure score submission
    if (HIGH_SCORES_ENABLED) {
      startGameSession();
      startHeartbeatInterval();
    }
    gameStartTimeRef.current = Date.now();
    // Game started
    // Focus canvas for input capture
    setTimeout(() => {
      canvasRef.current?.focus();
    }, 50);
  }, [startGameSession, startHeartbeatInterval]);

  const initDuel = useCallback(() => {
    keysRef.current = {};
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
    checkVersion();
    // Duel started
    setTimeout(() => {
      canvasRef.current?.focus();
    }, 50);
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

    // Guest (P2): reconcile authoritative position with client-side prediction
    if (!isHostRef.current && guestPredictedShipRef.current && net.respawnTimer[1] === 0) {
      const pred = guestPredictedShipRef.current;
      const dx = net.ship2.x - pred.pos.x;
      const dy = net.ship2.y - pred.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < 40) {
        // Small error: smooth blend toward authoritative position
        pred.pos.x += dx * 0.25;
        pred.pos.y += dy * 0.25;
      } else {
        // Large error: snap to authoritative
        pred.pos.x = net.ship2.x;
        pred.pos.y = net.ship2.y;
      }
      // Sync velocity and invulnerability from authoritative state
      pred.vel.x = net.ship2.vx;
      pred.vel.y = net.ship2.vy;
      pred.rotation = net.ship2.rot;
      pred.invulnerable = net.ship2.invuln;
      pred.invulnerableTime = net.ship2.invulnTime;
      // Use the reconciled prediction for rendering
      ds.ship2.pos = { ...pred.pos };
      ds.ship2.rotation = pred.rotation;
    } else {
      ds.ship2.pos = { x: net.ship2.x, y: net.ship2.y };
      ds.ship2.rotation = net.ship2.rot;
    }
    ds.ship2.vel = { x: net.ship2.vx, y: net.ship2.vy };
    ds.ship2.isThrusting = net.ship2.thrust;
    ds.ship2.invulnerable = net.ship2.invuln;
    ds.ship2.invulnerableTime = net.ship2.invulnTime;

    ds.bullets1 = net.bullets1.map((b) => ({
      pos: { x: b.x, y: b.y },
      vel: { x: b.vx, y: b.vy },
      rotation: b.rot,
      lifetime: b.lifetime,
      owner: b.owner,
    }));
    ds.bullets2 = net.bullets2.map((b) => ({
      pos: { x: b.x, y: b.y },
      vel: { x: b.vx, y: b.vy },
      rotation: b.rot,
      lifetime: b.lifetime,
      owner: b.owner,
    }));

    ds.asteroids = net.asteroids.map((a) => {
      const pts: Vector[] = [];
      for (let j = 0; j < a.points.length; j += 2) {
        pts.push({ x: a.points[j], y: a.points[j + 1] });
      }
      return {
        pos: { x: a.x, y: a.y },
        vel: { x: a.vx, y: a.vy },
        rotation: a.rot,
        size: a.size as "large" | "medium" | "small",
        rotationSpeed: a.rotSpeed,
        points: pts,
      };
    });

    ds.aliens = net.aliens.map((a) => ({
      pos: { x: a.x, y: a.y },
      vel: { x: a.vx, y: a.vy },
      rotation: 0,
      type: a.type as Alien["type"],
      hp: 1,
      moveTimer: 0,
      shootTimer: 999,
      zigzagPhase: 0,
    }));

    const prevK0 = ds.kills[0],
      prevK1 = ds.kills[1];
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
    const targets: { floatingTexts: FloatingText[]; particles: Particle[] }[] = [];
    if (duelStateRef.current) targets.push(duelStateRef.current);
    if (coopStateRef.current) targets.push(coopStateRef.current);
    for (const target of targets) {
      target.floatingTexts = target.floatingTexts.filter((ft) => {
        ft.pos.y -= 0.5;
        ft.lifetime--;
        ft.opacity = ft.lifetime / ft.maxLifetime;
        return ft.lifetime > 0;
      });
      target.particles = target.particles.filter((p) => {
        p.pos.x += p.vel.x;
        p.pos.y += p.vel.y;
        p.vel.x *= 0.97;
        p.vel.y *= 0.97;
        p.lifetime--;
        return p.lifetime > 0;
      });
    }
  }, []);

  const initOnline = useCallback((isHost: boolean) => {
    keysRef.current = {};
    duelStateRef.current = {
      ship1: createShip(CANVAS_WIDTH * 0.25, CANVAS_HEIGHT / 2),
      ship2: createShip(CANVAS_WIDTH * 0.75, CANVAS_HEIGHT / 2),
      bullets1: [],
      bullets2: [],
      asteroids: [],
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
    duelStateRef.current.ship1.rotation = 0;
    duelStateRef.current.ship2.rotation = Math.PI;
    gameStateRef.current = null;
    coopStateRef.current = null;
    setShowGameOver(false);
    setShowLifeLost(false);
    showLifeLostRef.current = false;
    setDuelKills([0, 0]);
    setDuelDeaths([0, 0]);
    setGameMode("online");
    broadcastTickRef.current = 0;
    checkVersion();

    if (isHost) {
      const worker = new Worker(new URL("../workers/gameWorker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.postMessage({ type: "init", turnSpeed: controlBindingsRef.current.turnSpeed || DEFAULT_TURN_SPEED });
    } else {
      // Guest: initialise client-side prediction ship (mirrors ship2 starting pos/rot)
      guestPredictedShipRef.current = createShip(CANVAS_WIDTH * 0.75, CANVAS_HEIGHT / 2);
      guestPredictedShipRef.current.rotation = Math.PI;
    }
    // Online game started
    setTimeout(() => {
      canvasRef.current?.focus();
    }, 50);
  }, []);

  // ===== CO-OP HELPERS =====

  const initCoop = useCallback((isOnlineHost = false, playerCount = 2) => {
    const pc = Math.max(1, Math.min(8, playerCount));
    keysRef.current = {};
    const startPositions =
      pc <= 2
        ? [
            { x: CANVAS_WIDTH * 0.25, y: CANVAS_HEIGHT / 2 },
            { x: CANVAS_WIDTH * 0.75, y: CANVAS_HEIGHT / 2 },
          ]
        : Array.from({ length: pc }, (_, i) => {
            const angle = (i / pc) * Math.PI * 2 - Math.PI / 2;
            return {
              x: CANVAS_WIDTH / 2 + (CANVAS_WIDTH / 2 - 100) * Math.cos(angle),
              y: CANVAS_HEIGHT / 2 + (CANVAS_HEIGHT / 2 - 80) * Math.sin(angle),
            };
          });
    const rotations = [
      0,
      Math.PI,
      Math.PI / 2,
      -Math.PI / 2,
      Math.PI / 4,
      -Math.PI / 4,
      (3 * Math.PI) / 4,
      (-3 * Math.PI) / 4,
    ];
    const initShips = startPositions.map((pos, i) => {
      const s = createShip(pos.x, pos.y);
      s.rotation = rotations[i % rotations.length];
      return s;
    });
    const cs: CoopState = {
      ships: initShips,
      bullets: Array.from({ length: pc }, () => []),
      bossBullets: [],
      alienBullets: [],
      asteroids: [],
      aliens: [],
      ufos: [],
      score: 0,
      lives: Array.from({ length: pc }, () => 3),
      eliminated: Array.from({ length: pc }, () => false),
      wave: 1,
      respawnTimer: Array.from({ length: pc }, () => 0),
      powerUpActive: Array.from({ length: pc }, () => ({ shield: 0, rapidFire: 0, multiplier: 0 })),
      hyperspaceCooldown: Array.from({ length: pc }, () => 0),
      powerUps: [],
      boss: null,
      waveComplete: false,
      waveCompleteTimer: 0,
      gameOver: false,
      floatingTexts: [],
      particles: [],
      stars: createStars(),
      playerCount: pc,
    };
    coopStateRef.current = cs;
    duelStateRef.current = null;
    gameStateRef.current = null;
    setShowGameOver(false);
    setShowLifeLost(false);
    showLifeLostRef.current = false;
    setCoopScore(0);
    setCoopWave(1);
    setCoopLives(Array.from({ length: pc }, () => 3));
    setCoopPlayerCount(pc);
    setCoopEliminated(Array.from({ length: pc }, () => false));
    setCoopGameOver(false);
    setCoopWaveComplete(false);
    setCoopPlayerStats([]);
    setGameMode(isOnlineHost ? "online_coop" : "coop");
    broadcastTickRef.current = 0;
    prevCoopThrustRef.current = false;
    prevCoopFireRef.current = false;
    prevCoopHyperspaceRef.current = false;
    checkVersion();

    // Reset countdown / ready-tracking state whenever a new game starts
    restartDeadlineRef.current = null;
    setRestartCountdown(null);
    readyPlayerIdxsRef.current = new Set();
    expectedGuestsForRestartRef.current = 0;
    setHostRestarted(false);

    // Start the co-op worker
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "stop" });
      workerRef.current.terminate();
    }
    const worker = new Worker(new URL("../workers/coopWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.postMessage({ type: "init", turnSpeed: controlBindingsRef.current.turnSpeed || DEFAULT_TURN_SPEED, playerCount: pc });

    // Bump generation so worker onmessage effects re-attach to the new worker
    coopGenerationRef.current += 1;
    setCoopGeneration(coopGenerationRef.current);

    setTimeout(() => {
      canvasRef.current?.focus();
    }, 50);
  }, []);

  const initOnlineCoop = useCallback(
    (isHost: boolean, playerCount = 2) => {
      if (isHost) {
        initCoop(true, playerCount);
      } else {
        // Guest: set up visual state only; physics run on host's worker
        const pc = Math.max(1, Math.min(8, playerCount));
        keysRef.current = {};
        const guestShip = createShip(CANVAS_WIDTH * 0.75, CANVAS_HEIGHT / 2);
        guestShip.rotation = Math.PI;
        coopStateRef.current = {
          ships: Array.from({ length: pc }, (_, i) => {
            const s = createShip(i === 0 ? CANVAS_WIDTH * 0.25 : CANVAS_WIDTH * 0.75, CANVAS_HEIGHT / 2);
            s.rotation = i === 0 ? 0 : Math.PI;
            return s;
          }),
          bullets: Array.from({ length: pc }, () => []),
          bossBullets: [],
          alienBullets: [],
          asteroids: [],
          aliens: [],
          ufos: [],
          score: 0,
          lives: Array.from({ length: pc }, () => 3),
          eliminated: Array.from({ length: pc }, () => false),
          wave: 1,
          respawnTimer: Array.from({ length: pc }, () => 0),
          powerUpActive: Array.from({ length: pc }, () => ({ shield: 0, rapidFire: 0, multiplier: 0 })),
          hyperspaceCooldown: Array.from({ length: pc }, () => 0),
          powerUps: [],
          boss: null,
          waveComplete: false,
          waveCompleteTimer: 0,
          gameOver: false,
          floatingTexts: [],
          particles: [],
          stars: createStars(),
          playerCount: pc,
        };
        duelStateRef.current = null;
        gameStateRef.current = null;
        setShowGameOver(false);
        setShowLifeLost(false);
        showLifeLostRef.current = false;
        setCoopScore(0);
        setCoopWave(1);
        setCoopLives(Array.from({ length: pc }, () => 3));
        setCoopPlayerCount(pc);
        setCoopEliminated(Array.from({ length: pc }, () => false));
        setCoopGameOver(false);
        setCoopWaveComplete(false);
        setCoopPlayerStats([]);
        setHostRestarted(false);
        restartDeadlineRef.current = null;
        setRestartCountdown(null);
        setGameMode("online_coop");
        broadcastTickRef.current = 0;
        prevCoopThrustRef.current = false;
        prevCoopFireRef.current = false;
        prevCoopHyperspaceRef.current = false;
        checkVersion();
        // Guest prediction ship (own player ship)
        const myIdx = multiplayer.playerIdxRef.current;
        guestPredictedShipRef.current = createShip(CANVAS_WIDTH * 0.75, CANVAS_HEIGHT / 2);
        guestPredictedShipRef.current.rotation = Math.PI;
        setTimeout(() => {
          canvasRef.current?.focus();
        }, 50);
      }
    },
    [initCoop, multiplayer.playerIdxRef],
  );
  // Keep stable refs in sync so setInterval callbacks can access latest versions
  useEffect(() => {
    initCoopRef.current = initCoop;
  }, [initCoop]);
  useEffect(() => {
    initOnlineCoopRef.current = initOnlineCoop;
  }, [initOnlineCoop]);

  const applyCoopNetState = useCallback(
    (net: CoopNetState) => {
      const cs = coopStateRef.current;
      if (!cs) return;

      const pc = net.playerCount ?? net.ships?.length ?? 2;
      const myIdx = multiplayer.playerIdxRef.current;

      // Ensure arrays are the right length
      while (cs.ships.length < pc) {
        cs.ships.push(createShip(CANVAS_WIDTH * 0.75, CANVAS_HEIGHT / 2));
        cs.bullets.push([]);
      }

      // Apply ship states from network
      for (let i = 0; i < pc && i < net.ships.length; i++) {
        const ns = net.ships[i];
        // For guest's own ship: reconcile with client-side prediction
        if (!isHostRef.current && i === myIdx && guestPredictedShipRef.current && net.respawnTimer[i] === 0) {
          const pred = guestPredictedShipRef.current;
          const dx = ns.x - pred.pos.x;
          const dy = ns.y - pred.pos.y;
          const d = Math.hypot(dx, dy);
          if (d < 40) {
            pred.pos.x += dx * 0.25;
            pred.pos.y += dy * 0.25;
          } else {
            pred.pos.x = ns.x;
            pred.pos.y = ns.y;
          }
          pred.vel.x = ns.vx;
          pred.vel.y = ns.vy;
          pred.rotation = ns.rot;
          pred.invulnerable = ns.invuln;
          pred.invulnerableTime = ns.invulnTime;
          cs.ships[i].pos = { ...pred.pos };
          cs.ships[i].rotation = pred.rotation;
        } else {
          cs.ships[i].pos = { x: ns.x, y: ns.y };
          cs.ships[i].rotation = ns.rot;
        }
        cs.ships[i].vel = { x: ns.vx, y: ns.vy };
        cs.ships[i].isThrusting = ns.thrust;
        cs.ships[i].invulnerable = ns.invuln;
        cs.ships[i].invulnerableTime = ns.invulnTime;
        cs.ships[i].hyperspaceCooldown = net.hyperspaceCooldown?.[i] ?? 0;
      }

      // Apply bullet states
      for (let i = 0; i < pc && i < net.bullets.length; i++) {
        cs.bullets[i] = net.bullets[i].map((b) => ({
          pos: { x: b.x, y: b.y },
          vel: { x: b.vx, y: b.vy },
          rotation: b.rot,
          lifetime: b.lifetime,
          owner: b.owner,
        }));
      }
      // Apply boss bullet states
      cs.bossBullets = (net.bossBullets ?? []).map((b) => ({
        pos: { x: b.x, y: b.y },
        vel: { x: b.vx, y: b.vy },
        rotation: b.rot,
        lifetime: b.lifetime,
        owner: b.owner,
      }));

      // Apply alien bullet states
      cs.alienBullets = (net.alienBullets ?? []).map((b) => ({
        pos: { x: b.x, y: b.y },
        vel: { x: b.vx, y: b.vy },
        rotation: b.rot,
        lifetime: b.lifetime,
        owner: b.owner,
        isAlien: true,
      }));

      cs.asteroids = net.asteroids.map((a) => {
        const pts: Vector[] = [];
        for (let j = 0; j < a.points.length; j += 2) {
          pts.push({ x: a.points[j], y: a.points[j + 1] });
        }
        return {
          pos: { x: a.x, y: a.y },
          vel: { x: a.vx, y: a.vy },
          rotation: a.rot,
          size: a.size as "large" | "medium" | "small",
          rotationSpeed: a.rotSpeed,
          points: pts,
        };
      });

      cs.aliens = net.aliens.map((a) => ({
        pos: { x: a.x, y: a.y },
        vel: { x: a.vx, y: a.vy },
        rotation: 0,
        type: a.type as Alien["type"],
        hp: 1,
        moveTimer: 0,
        shootTimer: 999,
        zigzagPhase: a.zigzagPhase ?? 0,
        isInvisible: a.isInvisible,
        chargeTimer: a.chargeTimer,
      }));

      // Power-ups on the field
      cs.powerUps = (net.powerUps ?? []).map((pu) => ({
        pos: { x: pu.x, y: pu.y },
        vel: { x: 0, y: 0 },
        rotation: pu.rotation,
        type: pu.type,
        lifetime: 300,
      }));

      // Boss state
      if (net.boss) {
        const nb = net.boss;
        cs.boss = {
          pos: { x: nb.x, y: nb.y },
          vel: { x: 0, y: 0 },
          rotation: nb.rotation,
          hp: nb.hp,
          maxHp: nb.maxHp,
          tentacles: nb.tentacles,
          shootTimer: nb.shootTimer,
          hitFlash: nb.hitFlash,
          phase: nb.phase,
          entered: nb.entered,
          targetY: nb.targetY,
          bossType: nb.bossType,
          bounceVelX: nb.bounceVelX,
          bounceVelY: nb.bounceVelY,
          rotAngle: nb.rotAngle,
          tractorBeamActive: nb.tractorBeamActive,
          sweepAngle: nb.sweepAngle,
          miniSaucers: nb.miniSaucers?.map((ms) => ({
            pos: { x: ms.x, y: ms.y },
            vel: { x: 0, y: 0 },
            hp: 1,
            shootTimer: 999,
          })),
          cubeRotX: nb.cubeRotX,
          cubeRotY: nb.cubeRotY,
          regenTimer: nb.regenTimer,
          miniCubes: nb.miniCubes?.map((mc) => ({
            pos: { x: mc.x, y: mc.y },
            vel: { x: 0, y: 0 },
            hp: 1,
            rotAngle: mc.rotAngle,
          })),
        } as Boss;
      } else {
        cs.boss = null;
      }

      // UFO state
      cs.ufos = (net.ufos ?? []).map((u) => ({
        pos: { x: u.x, y: u.y },
        vel: { x: u.vx, y: u.vy },
        rotation: 0,
        size: u.size,
        shootTimer: 999,
        waveOffset: u.waveOffset,
        beepTimer: 120,
      }));

      // Per-player state
      const prevScore = cs.score;
      const prevWave = cs.wave;
      const prevLives = [...(cs.lives ?? [])]; // capture BEFORE overwriting cs.lives
      const prevEliminated = [...(cs.eliminated ?? [])]; // capture BEFORE overwriting
      cs.lives = net.lives ?? [3, 3];
      cs.eliminated = net.eliminated ?? Array.from({ length: pc }, () => false);
      cs.respawnTimer = net.respawnTimer;
      cs.powerUpActive =
        net.powerUpActive ?? Array.from({ length: pc }, () => ({ shield: 0, rapidFire: 0, multiplier: 0 }));
      cs.hyperspaceCooldown = net.hyperspaceCooldown ?? Array.from({ length: pc }, () => 0);
      cs.waveComplete = net.waveComplete;
      cs.gameOver = net.gameOver;
      cs.playerCount = pc;

      cs.score = net.score;
      cs.wave = net.wave;

      for (const event of net.events) {
        if (event.type === "explosion" || event.type === "die_env") {
          spawnExplosionTo(cs.particles, { x: event.x, y: event.y }, event.color, event.count);
          soundEffects.explode();
        }
        if (event.type === "small_explode") {
          spawnExplosionTo(cs.particles, { x: event.x, y: event.y }, event.color, event.count);
          soundEffects.smallExplode?.();
        }
        if (event.type === "ufo_beep") {
          soundEffects.ufoBeep?.();
        }
        if (event.type === "score_pop" && event.points) {
          spawnFloatingTextTo(cs.floatingTexts, { x: event.x, y: event.y }, `+${event.points}`, "#FFFF00", 16);
        }
        if (event.type === "powerup" && event.label) {
          spawnFloatingTextTo(cs.floatingTexts, { x: event.x, y: event.y }, event.label, "#CC66FF", 18);
          soundEffects.powerUp?.();
        }
        if (event.type === "boss_spawn" && event.label) {
          spawnFloatingTextTo(cs.floatingTexts, { x: event.x, y: event.y }, event.label, "#FF4444", 22);
        }
        if (event.type === "wave_start" && event.label) {
          const waveTheme = getTheme(cs.wave);
          spawnFloatingTextTo(cs.floatingTexts, { x: event.x, y: event.y }, event.label, waveTheme.ship, 28);
        }
      }

      if (cs.score !== prevScore) setCoopScore(cs.score);
      if (cs.wave !== prevWave) setCoopWave(cs.wave);
      const livesChanged = cs.lives.some((l, i) => l !== prevLives[i]);
      if (livesChanged) setCoopLives([...cs.lives]);
      const eliminatedChanged = cs.eliminated.some((e, i) => e !== prevEliminated[i]);
      if (eliminatedChanged) setCoopEliminated([...cs.eliminated]);
      if (net.gameOver) {
        setCoopGameOver(true);
        if (net.playerScores) {
          const pc = net.playerCount ?? net.ships?.length ?? 2;
          const stats: CoopPlayerStat[] = Array.from({ length: pc }, (_, i) => ({
            playerIndex: i,
            label: `P${i + 1}`,
            score: net.playerScores?.[i] ?? 0,
            asteroidsDestroyed: net.playerAsteroidsDestroyed?.[i] ?? 0,
            enemiesKilled: net.playerEnemiesKilled?.[i] ?? 0,
            powerUpsCollected: net.playerPowerUpsCollected?.[i] ?? 0,
          }));
          stats.sort((a, b) => b.score - a.score);
          setCoopPlayerStats(stats);
        }
      } else {
        setCoopGameOver(false);
      }
      if (net.waveComplete) setCoopWaveComplete(true);
      else setCoopWaveComplete(false);
    },
    [multiplayer.playerIdxRef],
  );

  const nextWave = useCallback(() => {
    if (!gameStateRef.current) return;
    const state = gameStateRef.current;

    state.wave++;
    state.bullets = [];

    addDebugLog("wave", `Wave ${state.wave} started`);
    const isBossWave = state.wave % 5 === 0;

    if (isBossWave) {
      state.bossDefeated = false;
      state.pendingNextWave = false;
      state.boss = createBoss(state.wave);
      addDebugLog("boss", `Boss spawned for wave ${state.wave}, HP: ${state.boss.hp}`);
      state.asteroids = [];
      state.aliens = [];
      state.ship = createShip();
      setDisplayWave(state.wave);

      const theme = getTheme(state.wave);
      spawnFloatingText({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 - 40 }, `WAVE ${state.wave}`, theme.ship, 28);
      const bType = Math.floor((state.wave / 5 - 1) % 4);
      const bossLabel = BOSS_NAMES[BOSS_TYPES[bType]] ?? "BOSS";
      spawnFloatingText({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 + 10 }, `⚠ ${bossLabel} INCOMING ⚠`, "#FF4444", 22);
      // Boss wave started
      return;
    }

    state.bossDefeated = false;
    state.pendingNextWave = false;
    const numAsteroids = Math.min(4 + state.wave * 2, 20);
    const asteroids: Asteroid[] = [];

    for (let i = 0; i < numAsteroids; i++) {
      let x: number, y: number, dist: number;
      let retries = 0;
      do {
        x = Math.random() * CANVAS_WIDTH;
        y = Math.random() * CANVAS_HEIGHT;
        dist = Math.hypot(x - CANVAS_WIDTH / 2, y - CANVAS_HEIGHT / 2);
        retries++;
      } while (dist <= 150 && retries < 100);
      if (dist > 150) {
        asteroids.push(createAsteroid(x, y, "large", state.wave));
      }
    }

    state.asteroids = asteroids;
    state.ship = createShip();
    state.alienSpawnTimer = Math.max(300, 600 - state.wave * 20);
    setDisplayWave(state.wave);

    const theme = getTheme(state.wave);
    spawnFloatingText({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }, `WAVE ${state.wave}`, theme.ship, 28);

    if ((state.wave - 1) % 5 === 0 && state.wave > 1) {
      spawnFloatingText(
        { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 + 35 },
        `${theme.name.toUpperCase()} ZONE`,
        theme.accent,
        18,
      );
    }

    // Wave started
  }, [addDebugLog]);

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

    const wrapped =
      Math.abs(asteroid.pos.x - oldX) > CANVAS_WIDTH * 0.5 || Math.abs(asteroid.pos.y - oldY) > CANVAS_HEIGHT * 0.5;

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
    const r = radius1 + radius2;
    return dx * dx + dy * dy < r * r;
  };

  // Award extra lives at escalating score thresholds, capped at MAX_LIVES (solo only)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const awardExtraLives = useCallback((state: GameState, _prevScore: number) => {
    while (state.score >= extraLifeThreshold((state.extraLifeCount ?? 0) + 1)) {
      state.extraLifeCount = (state.extraLifeCount ?? 0) + 1;
      if (state.lives < BALANCE.MAX_LIVES) {
        state.lives++;
        setDisplayLives(state.lives);
        spawnFloatingText(state.ship.pos, "EXTRA LIFE!", "#CC66FF", 22);
        soundEffects.powerUp();
      }
    }
  }, []);

  // Register a scoring kill on the chain combo (solo only)
  const bumpChain = useCallback((state: GameState) => {
    state.chain++;
    state.chainTimer = CHAIN_WINDOW;
    state.bestChain = Math.max(state.bestChain, state.chain);
  }, []);

  const killMultiplier = useCallback((state: GameState) => {
    const powerUpMult = state.powerUpActive.multiplier > 0 ? 2 : 1;
    return powerUpMult * Math.min(1 + state.chain * CHAIN_STEP, CHAIN_MAX);
  }, []);


  // Build the post-run summary + personal-best comparison (solo only)
  const buildRunSummary = useCallback((state: GameState) => {
    if (gameModeRef.current !== "solo") return;
    const fired = gameStatsRef.current.bulletsFired;
    const accuracy = fired > 0 ? (gameStatsRef.current.asteroidsDestroyed / fired) * 100 : null;
    const timeSurvived = Math.max(0, Math.floor((Date.now() - runStartTimeRef.current) / 1000));
    let prevBest: {
      score: number;
      wave: number;
      timeSurvived: number;
      accuracy: number | null;
    } | null = null;
    try {
      const raw = localStorage.getItem("personalBest");
      if (raw) prevBest = JSON.parse(raw);
    } catch {
      prevBest = null;
    }
    setRunSummary({
      score: state.score,
      wave: state.wave,
      timeSurvived,
      accuracy,
      asteroids: gameStatsRef.current.asteroidsDestroyed,
      bestChain: state.bestChain,
      prevBest,
    });
    // Update the stored PB after capturing the comparison snapshot
    if (!prevBest || state.score > prevBest.score) {
      try {
        localStorage.setItem(
          "personalBest",
          JSON.stringify({ score: state.score, wave: state.wave, timeSurvived, accuracy }),
        );
      } catch {
        /* ignore quota errors */
      }
    }
  }, []);


  const loseLife = useCallback(
    (state: GameState) => {
      // Trainer mode: prevent death
      if (DEBUG_ENABLED && trainerModeRef.current) {
        addDebugLog(
          "death",
          `Trainer mode: death prevented at (${Math.round(state.ship.pos.x)}, ${Math.round(state.ship.pos.y)})`,
        );
        state.ship.invulnerable = true;
        state.ship.invulnerableTime = 60;
        return;
      }
      addDebugLog(
        "death",
        `Ship destroyed at (${Math.round(state.ship.pos.x)}, ${Math.round(state.ship.pos.y)}), lives: ${state.lives - 1}`,
      );
      spawnExplosion(state.ship.pos, "#FFFFFF", 20);
      state.lives--;
      state.chain = 0;
      state.chainTimer = 0;
      setDisplayLives(state.lives);
      state.ship = createShip();
      soundEffects.explode();
      soundEffects.stopThrust();
      haptics.heavy();

      if (state.lives <= 0) {
        state.gameOver = true;
        void sendHeartbeat(true);
        pendingSubmissionRef.current = {
          token: gameSessionTokenRef.current ?? "",
          nonce: sessionNonceRef.current,
          score: state.score,
          wave: state.wave,
          asteroidsDestroyed: gameStatsRef.current.asteroidsDestroyed,
          bulletsFired: gameStatsRef.current.bulletsFired,
          seq: heartbeatSeqRef.current,
        };
        stopHeartbeatInterval();
        buildRunSummary(state);
        setShowGameOver(true);
        // Offer initials entry for either local or cloud leaderboard qualification (skip in trainer mode)
        if (!(DEBUG_ENABLED && trainerModeRef.current) && shouldPromptForInitials(state.score)) {
          setEnteringInitials(true);
        }
        // Also refresh server leaderboard if enabled
        if (HIGH_SCORES_ENABLED) loadLeaderboard().then(setLeaderboard);
        // Game over
        haptics.gameOver();
      } else {
        showLifeLostRef.current = true;
        setShowLifeLost(true);
      }
    },
    [shouldPromptForInitials, loadLeaderboard, addDebugLog, sendHeartbeat, stopHeartbeatInterval, buildRunSummary],
  );

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
      gameStatsRef.current.bulletsFired++;
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

    const state = gameStateRef.current;

    // Check cooldown
    if (state.ship.hyperspaceCooldown > 0) {
      return;
    }

    // Find a safe position away from all threats
    let safePos: Vector | null = null;
    let attempts = 0;
    const maxAttempts = 100;

    while (!safePos && attempts < maxAttempts) {
      const testPos = {
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
      };

      let isSafe = true;

      // Check distance from asteroids
      for (const asteroid of state.asteroids) {
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        const minSafeDist = radius + SHIP_SIZE + 50; // Extra safety margin
        const dist = Math.hypot(testPos.x - asteroid.pos.x, testPos.y - asteroid.pos.y);
        if (dist < minSafeDist) {
          isSafe = false;
          break;
        }
      }

      // Check distance from UFOs
      if (isSafe) {
        for (const ufo of state.ufos) {
          const radius = ufo.size === "large" ? 20 : 10;
          const minSafeDist = radius + SHIP_SIZE + 50;
          const dist = Math.hypot(testPos.x - ufo.pos.x, testPos.y - ufo.pos.y);
          if (dist < minSafeDist) {
            isSafe = false;
            break;
          }
        }
      }

      // Check distance from aliens
      if (isSafe) {
        for (const alien of state.aliens) {
          const minSafeDist = 12 + SHIP_SIZE + 50;
          const dist = Math.hypot(testPos.x - alien.pos.x, testPos.y - alien.pos.y);
          if (dist < minSafeDist) {
            isSafe = false;
            break;
          }
        }
      }

      // Check distance from boss
      if (isSafe && state.boss && state.boss.entered) {
        const minSafeDist = 65 + SHIP_SIZE + 80;
        const dist = Math.hypot(testPos.x - state.boss.pos.x, testPos.y - state.boss.pos.y);
        if (dist < minSafeDist) {
          isSafe = false;
        }
      }

      // Check distance from enemy bullets
      if (isSafe) {
        for (const bullet of state.bullets) {
          if (bullet.isUFO || bullet.isAlien) {
            const minSafeDist = 30;
            const dist = Math.hypot(testPos.x - bullet.pos.x, testPos.y - bullet.pos.y);
            if (dist < minSafeDist) {
              isSafe = false;
              break;
            }
          }
        }
      }

      if (isSafe) {
        safePos = testPos;
      }
      attempts++;
    }

    // If no safe position found after max attempts, use best effort (center of screen)
    if (!safePos) {
      safePos = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
    }

    state.ship.pos = safePos;
    state.ship.vel = { x: 0, y: 0 };
    state.ship.hyperspaceCooldown = 600; // 10 seconds at 60fps
    state.ship.invulnerable = true;
    state.ship.invulnerableTime = SPAWN_INVULNERABILITY_FRAMES; // 2 seconds of invulnerability after hyperspace

    // Hyperspace jump executed
  }, []);

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

    if (ship.hyperspaceCooldown > 0) {
      ship.hyperspaceCooldown--;
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

    // P1: Custom keys or gamepad 0
    const b = controlBindingsRef.current;
    const p1Left = keys[b.p1.left] || gp0.left;
    const p1Right = keys[b.p1.right] || gp0.right;
    const p1Up = keys[b.p1.thrust] || gp0.up;
    const p1Fire = keys[b.p1.fire] || gp0.fire;

    // P2: Custom keys or gamepad 1
    const p2Left = keys[b.p2.left] || keys[b.p2.left.toUpperCase()] || gp1.left;
    const p2Right = keys[b.p2.right] || keys[b.p2.right.toUpperCase()] || gp1.right;
    const p2Up = keys[b.p2.thrust] || keys[b.p2.thrust.toUpperCase()] || gp1.up;
    const p2Fire = keys[b.p2.fire] || keys[b.p2.fire.toUpperCase()] || gp1.fire;

    // Handle respawn timers
    for (let p = 0; p < 2; p++) {
      if (ds.respawnTimer[p] > 0) {
        ds.respawnTimer[p]--;
        if (ds.respawnTimer[p] === 0) {
          const ship = p === 0 ? ds.ship1 : ds.ship2;
          ship.pos = { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT };
          ship.vel = { x: 0, y: 0 };
          ship.invulnerable = true;
          ship.invulnerableTime = SPAWN_INVULNERABILITY_FRAMES;
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
    const updateBullets = (bullets: Bullet[]) =>
      bullets.filter((b) => {
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
      if (edge < 0.25) {
        x = 0;
        y = Math.random() * CANVAS_HEIGHT;
      } else if (edge < 0.5) {
        x = CANVAS_WIDTH;
        y = Math.random() * CANVAS_HEIGHT;
      } else if (edge < 0.75) {
        x = Math.random() * CANVAS_WIDTH;
        y = 0;
      } else {
        x = Math.random() * CANVAS_WIDTH;
        y = CANVAS_HEIGHT;
      }
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
      spawnFloatingTextTo(
        ds.floatingTexts,
        ship.pos,
        `P${killerIdx + 1} KILL!`,
        killerIdx === 0 ? P1_COLOR : P2_COLOR,
        20,
      );
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
    if (
      !gameStateRef.current ||
      gameStateRef.current.gameOver ||
      showLifeLostRef.current
    )
      return;

    const state = gameStateRef.current;

    // Resolve deferred wave transition on a clean tick
    if (state.pendingNextWave) {
      state.pendingNextWave = false;
      nextWave();
      return;
    }
    const theme = getTheme(state.wave);
    const gp0 = readGamepad(0);

    const b = controlBindingsRef.current;
    const p1Left = keysRef.current[b.p1.left] || gp0.left;
    const p1Right = keysRef.current[b.p1.right] || gp0.right;
    const p1Up = keysRef.current[b.p1.thrust] || gp0.up;

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

    // Keyboard + Gamepad fire (polled every frame; shootBullet has its own rate-limit)
    const p1Fire = keysRef.current[b.p1.fire] || gp0.fire;
    const p1Hyper = keysRef.current[b.p1.hyperspace] || keysRef.current["h"] || keysRef.current["H"] || gp0.hyperspace;
    if (p1Fire) shootBullet();
    if (p1Hyper) hyperspace();

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
      if (state.ship.invulnerableTime === 0 && state.powerUpActive.shield === 0) {
        state.ship.invulnerable = false;
      }
    }

    if (state.ship.hyperspaceCooldown > 0) {
      state.ship.hyperspaceCooldown--;
    }

    // Update hyperspace charge display
    const chargePercent = Math.round(((600 - state.ship.hyperspaceCooldown) / 600) * 100);
    setHyperChargePercent(chargePercent);
    if (chargePercent >= 100 && !hyperChargeReadyRef.current) {
      hyperChargeReadyRef.current = true;
      soundEffects.powerUp();
    } else if (chargePercent < 100) {
      hyperChargeReadyRef.current = false;
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
      addDebugLog("spawn", `UFO spawned (${size})`);
      state.ufoSpawnTimer = Math.max(400, 900 - state.wave * 30) + Math.random() * 400;
    }

    // Update UFOs
    state.ufos = state.ufos.filter((ufo) => {
      ufo.pos.x += ufo.vel.x;
      ufo.waveOffset += 0.03;
      ufo.vel.y = Math.sin(ufo.waveOffset) * 1.2;
      ufo.pos.y += ufo.vel.y;

      if (ufo.pos.x < -30 || ufo.pos.x > CANVAS_WIDTH + 30) return false;

      ufo.beepTimer--;
      if (ufo.beepTimer <= 0) {
        soundEffects.ufoBeep();
        ufo.beepTimer = 120 + Math.random() * 60;
      }

      ufo.shootTimer--;
      if (ufo.shootTimer <= 0) {
        ufo.shootTimer = 60 + Math.random() * 60;
        const angle =
          ufo.size === "small"
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
        if (state.wave >= 3 && state.aliens.filter((a) => a.type === "brown").length < 3) {
          state.aliens.push(createAlien("brown", state.wave));
          addDebugLog("spawn", `Brown alien spawned (wave ${state.wave})`);
        }
        if (state.wave >= 6 && state.aliens.filter((a) => a.type === "greenMan").length < 2) {
          state.aliens.push(createAlien("greenMan", state.wave));
          state.alienSpawnTimer += 300; // Extra cooldown for green enemy spawns
          addDebugLog("spawn", `Green man spawned (wave ${state.wave})`);
        }
        // Red Drone removed
        if (state.wave >= 8 && state.aliens.filter((a) => a.type === "blueSentinel").length < 1) {
          state.aliens.push(createAlien("blueSentinel", state.wave));
          addDebugLog("spawn", `Blue sentinel spawned (wave ${state.wave})`);
        }
        if (state.wave >= 12 && state.aliens.filter((a) => a.type === "purpleSwarm").length < 3) {
          const swarm = spawnPurpleSwarmGroup(state.wave);
          state.aliens.push(...swarm);
          addDebugLog("spawn", `Purple swarm group spawned (wave ${state.wave})`);
        }
        state.alienSpawnTimer = Math.max(180, 500 - state.wave * 20) + Math.random() * 200;
      }
    }

    // Pre-compute purple swarm flock groups (avoids O(n²) filter inside the update loop)
    const flockMap = new Map<number, Alien[]>();
    for (const alien of state.aliens) {
      if (alien.type === "purpleSwarm" && alien.flockId !== undefined) {
        const group = flockMap.get(alien.flockId);
        if (group) group.push(alien);
        else flockMap.set(alien.flockId, [alien]);
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
      } else if (alien.type === "greenMan") {
        alien.vel.x *= 0.99;
        alien.vel.y += Math.sin(alien.zigzagPhase) * 0.02;
        alien.shootTimer--;
        if (alien.shootTimer <= 0) {
          alien.shootTimer = Math.max(40, 80 - state.wave * 2) + Math.random() * 40;
          const baseAngle = Math.atan2(state.ship.pos.y - alien.pos.y, state.ship.pos.x - alien.pos.x);
          const angle = baseAngle + (Math.random() - 0.5) * 0.35; // ~10% less accurate
          state.bullets.push({
            pos: { ...alien.pos },
            vel: { x: Math.cos(angle) * 6, y: Math.sin(angle) * 6 },
            rotation: angle,
            lifetime: BULLET_LIFETIME,
            isAlien: true,
            color: "#44FF44",
          });
        }
      } else if (alien.type === "blueSentinel") {
        // Teleport + burst fire + invisibility
        alien.teleportCooldown = (alien.teleportCooldown ?? 90) - 1;
        alien.vel.x *= 0.95;
        alien.vel.y *= 0.95;

        if (alien.isInvisible) {
          alien.invisTimer = (alien.invisTimer ?? 0) - 1;
          if (alien.invisTimer! <= 0) {
            alien.isInvisible = false;
          }
        } else {
          alien.shootTimer--;
          if (alien.shootTimer <= 0 && (alien.burstCount ?? 0) < 3) {
            alien.burstCount = (alien.burstCount ?? 0) + 1;
            alien.shootTimer = 15; // Slower burst
            const angle = Math.atan2(state.ship.pos.y - alien.pos.y, state.ship.pos.x - alien.pos.x);
            const spread = (alien.burstCount! - 2) * 0.15;
            state.bullets.push({
              pos: { ...alien.pos },
              vel: { x: Math.cos(angle + spread) * 3.5, y: Math.sin(angle + spread) * 3.5 },
              rotation: angle + spread,
              lifetime: BULLET_LIFETIME,
              isAlien: true,
              color: "#4488FF",
            });
            if (alien.burstCount! >= 3) {
              alien.burstCount = 0;
              alien.shootTimer = 120 + Math.random() * 60;
              // Go invisible after burst
              alien.isInvisible = true;
              alien.invisTimer = 60;
            }
          }

          if (alien.teleportCooldown! <= 0) {
            if (!alien.chargeTimer || alien.chargeTimer <= 0) {
              // Start charge-up before teleport
              alien.chargeTimer = 30; // 0.5 sec charge
              soundEffects.warpCharge();
            }
          }
          // Process charge timer
          if (alien.chargeTimer && alien.chargeTimer > 0) {
            alien.chargeTimer--;
            alien.vel.x = 0;
            alien.vel.y = 0;
            if (alien.chargeTimer <= 0) {
              // Execute teleport
              alien.pos.x = 50 + Math.random() * (CANVAS_WIDTH - 100);
              alien.pos.y = 50 + Math.random() * (CANVAS_HEIGHT - 100);
              alien.vel.x = 0;
              alien.vel.y = 0;
              alien.teleportCooldown = 200 + Math.random() * 120;
              spawnExplosion(alien.pos, "#4488FF", 6);
            }
          }
        }
      } else if (alien.type === "purpleSwarm") {
        // Boids-like flocking toward centroid of same flock, chase player
        const group = alien.flockId !== undefined ? (flockMap.get(alien.flockId) ?? []) : [];
        const flockMates = group.filter((a) => a !== alien);
        let cx = state.ship.pos.x,
          cy = state.ship.pos.y;
        if (flockMates.length > 0) {
          cx = flockMates.reduce((s, a) => s + a.pos.x, alien.pos.x) / (flockMates.length + 1);
          cy = flockMates.reduce((s, a) => s + a.pos.y, alien.pos.y) / (flockMates.length + 1);
          // Blend centroid toward player
          cx = cx * 0.4 + state.ship.pos.x * 0.6;
          cy = cy * 0.4 + state.ship.pos.y * 0.6;
        }
        const toTarget = Math.atan2(cy - alien.pos.y, cx - alien.pos.x);
        alien.vel.x += Math.cos(toTarget) * 0.015;
        alien.vel.y += Math.sin(toTarget) * 0.015;
        // Separation from close flockmates
        flockMates.forEach((mate) => {
          const d = Math.hypot(mate.pos.x - alien.pos.x, mate.pos.y - alien.pos.y);
          if (d < 25 && d > 0) {
            alien.vel.x -= ((mate.pos.x - alien.pos.x) / d) * 0.3;
            alien.vel.y -= ((mate.pos.y - alien.pos.y) / d) * 0.3;
          }
        });
        const curSpd = Math.hypot(alien.vel.x, alien.vel.y);
        const maxSpd = 0.8 * getSpeedScale(state.wave);
        if (curSpd > maxSpd) {
          alien.vel.x = (alien.vel.x / curSpd) * maxSpd;
          alien.vel.y = (alien.vel.y / curSpd) * maxSpd;
        }
      }

      alien.pos.x += alien.vel.x;
      alien.pos.y += alien.vel.y;

      if (
        alien.pos.x < -60 ||
        alien.pos.x > CANVAS_WIDTH + 60 ||
        alien.pos.y < -60 ||
        alien.pos.y > CANVAS_HEIGHT + 60
      ) {
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
      } else if (boss.bossType === "tentacle") {
        // Original tentacle boss behavior
        boss.pos.x += boss.vel.x;
        if (boss.pos.x < 100 || boss.pos.x > CANVAS_WIDTH - 100) boss.vel.x *= -1;
        boss.pos.y = boss.targetY + Math.sin(boss.phase) * 30;
        boss.shootTimer--;
        if (boss.shootTimer <= 0) {
          boss.shootTimer = Math.max(40, 90 - state.wave * 3);
          const baseAngle = Math.atan2(state.ship.pos.y - boss.pos.y, state.ship.pos.x - boss.pos.x);
          for (let i = -1; i <= 1; i++) {
            state.bullets.push({
              pos: { ...boss.pos },
              vel: { x: Math.cos(baseAngle + i * 0.3) * 4, y: Math.sin(baseAngle + i * 0.3) * 4 },
              rotation: baseAngle + i * 0.3,
              lifetime: BULLET_LIFETIME * 1.5,
              isUFO: true,
              color: "#FF66FF",
            });
          }
        }
      } else if (boss.bossType === "amigaBall") {
        // Bouncing ball physics
        boss.rotAngle = (boss.rotAngle ?? 0) + 0.015;
        const gravity = 0.025;
        boss.bounceVelY = (boss.bounceVelY ?? 0) + gravity;
        boss.bounceVelX = boss.bounceVelX ?? 1 + Math.random() * 1.5;
        boss.pos.x += boss.bounceVelX;
        boss.pos.y += boss.bounceVelY;
        boss.lastBounceFrame = (boss.lastBounceFrame ?? 0) + 1;

        // Wall bounce
        if (boss.pos.x < 60 || boss.pos.x > CANVAS_WIDTH - 60) {
          boss.bounceVelX *= -1;
          boss.pos.x = Math.max(60, Math.min(CANVAS_WIDTH - 60, boss.pos.x));
        }
        // Floor/ceiling bounce
        if (boss.pos.y > CANVAS_HEIGHT - 80) {
          boss.bounceVelY = -(Math.abs(boss.bounceVelY) * 0.5 + 0.5 + Math.random() * 2);
          boss.pos.y = CANVAS_HEIGHT - 80;
          // Shockwave on bounce
          if (boss.lastBounceFrame > 30) {
            boss.lastBounceFrame = 0;
            for (let i = 0; i < 12; i++) {
              const ang = (i / 12) * Math.PI * 2;
              state.particles.push({
                pos: { x: boss.pos.x, y: boss.pos.y + 50 },
                vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 1.5 },
                lifetime: 30,
                maxLifetime: 30,
                color: "#FF4444",
                size: 3,
              });
            }
            soundEffects.explode();
          }
        }
        if (boss.pos.y < 40) {
          boss.bounceVelY = Math.abs(boss.bounceVelY);
          boss.pos.y = 40;
        }

        // Radial burst attack
        boss.shootTimer--;
        if (boss.shootTimer <= 0) {
          boss.shootTimer = Math.max(90, 180 - state.wave * 2);
          const count = 8;
          for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2;
            state.bullets.push({
              pos: { ...boss.pos },
              vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
              rotation: ang,
              lifetime: BULLET_LIFETIME * 2.5,
              isUFO: true,
              color: "#CC0000",
            });
          }
        }
      } else if (boss.bossType === "flyingSaucer") {
        // Slow lateral sweep
        boss.pos.x += Math.sin(boss.phase * 0.5) * 1.5;
        boss.pos.y = boss.targetY + Math.sin(boss.phase * 0.3) * 20;
        boss.sweepAngle = (boss.sweepAngle ?? 0) + 0.02;
        boss.tractorBeamAngle = Math.atan2(state.ship.pos.y - boss.pos.y, state.ship.pos.x - boss.pos.x);

        // Tractor beam: periodically pull player
        boss.tractorBeamActive = Math.sin(boss.phase * 1.5) > 0.3;
        if (boss.tractorBeamActive && !state.ship.invulnerable) {
          const pull = 0.015;
          state.ship.vel.x += (boss.pos.x - state.ship.pos.x) * pull * 0.01;
          state.ship.vel.y += (boss.pos.y - state.ship.pos.y) * pull * 0.01;
        }

        // Spawn mini-saucers
        boss.miniSaucerTimer = (boss.miniSaucerTimer ?? 300) - 1;
        if (!boss.miniSaucers) boss.miniSaucers = [];
        if (boss.miniSaucerTimer <= 0 && boss.miniSaucers.length < 3) {
          boss.miniSaucerTimer = 250 + Math.random() * 100;
          boss.miniSaucers.push({
            pos: { ...boss.pos },
            vel: { x: (Math.random() - 0.5) * 3, y: 1 + Math.random() * 2 },
            hp: 1,
            shootTimer: 60 + Math.random() * 40,
          });
        }

        // Update mini-saucers
        boss.miniSaucers = boss.miniSaucers.filter((ms) => {
          ms.pos.x += ms.vel.x;
          ms.pos.y += ms.vel.y;
          ms.shootTimer--;
          if (ms.shootTimer <= 0) {
            ms.shootTimer = 80 + Math.random() * 40;
            const ang = Math.atan2(state.ship.pos.y - ms.pos.y, state.ship.pos.x - ms.pos.x);
            state.bullets.push({
              pos: { ...ms.pos },
              vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 },
              rotation: ang,
              lifetime: BULLET_LIFETIME,
              isUFO: true,
              color: "#88FFAA",
            });
          }
          return ms.pos.y < CANVAS_HEIGHT + 30 && ms.pos.x > -30 && ms.pos.x < CANVAS_WIDTH + 30;
        });

        // Sweeping laser
        boss.shootTimer--;
        if (boss.shootTimer <= 0) {
          boss.shootTimer = Math.max(80, 160 - state.wave * 2);
          const laserAngle = boss.sweepAngle!;
          for (let d = 0; d < 300; d += 20) {
            state.bullets.push({
              pos: { x: boss.pos.x + Math.cos(laserAngle) * d, y: boss.pos.y + Math.sin(laserAngle) * d },
              vel: { x: Math.cos(laserAngle) * 3.5, y: Math.sin(laserAngle) * 3.5 },
              rotation: laserAngle,
              lifetime: 20,
              isUFO: true,
              color: "#00FF88",
            });
          }
        }
      } else if (boss.bossType === "borgCube") {
        // Track player position slowly
        boss.cubeRotX = (boss.cubeRotX ?? 0) + 0.008;
        boss.cubeRotY = (boss.cubeRotY ?? 0) + 0.012;
        boss.adaptPhase = (boss.adaptPhase ?? 0) + 0.01;

        const targetX = state.ship.pos.x;
        boss.pos.x += (targetX - boss.pos.x) * 0.005;
        boss.pos.y = boss.targetY + Math.sin(boss.adaptPhase) * 15;

        // HP regeneration every 180 ticks
        boss.regenTimer = (boss.regenTimer ?? 0) + 1;
        if (boss.regenTimer >= 300 && boss.hp < boss.maxHp) {
          boss.hp = Math.min(boss.maxHp, boss.hp + 1);
          boss.regenTimer = 0;
          spawnFloatingText(boss.pos, "REGEN", "#00FF44", 12);
        }

        // Grid-pattern laser bursts
        boss.gridLaserTimer = (boss.gridLaserTimer ?? 180) - 1;
        if (boss.gridLaserTimer <= 0) {
          boss.gridLaserTimer = Math.max(120, 240 - state.wave * 3);
          // Fire grid pattern: 4 cardinal + 4 diagonal
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + boss.cubeRotX!;
            state.bullets.push({
              pos: { ...boss.pos },
              vel: { x: Math.cos(ang) * 2.5, y: Math.sin(ang) * 2.5 },
              rotation: ang,
              lifetime: BULLET_LIFETIME * 1.5,
              isUFO: true,
              color: "#44FF44",
            });
          }
        }

        // Secondary aimed shot
        boss.shootTimer--;
        if (boss.shootTimer <= 0) {
          boss.shootTimer = Math.max(60, 120 - state.wave * 2);
          const ang = Math.atan2(state.ship.pos.y - boss.pos.y, state.ship.pos.x - boss.pos.x);
          state.bullets.push({
            pos: { ...boss.pos },
            vel: { x: Math.cos(ang) * 2.8, y: Math.sin(ang) * 2.8 },
            rotation: ang,
            lifetime: BULLET_LIFETIME * 1.5,
            isUFO: true,
            color: "#00CC00",
          });
        }

        // Spawn mini cubes every 5-8 seconds
        boss.miniCubeTimer = (boss.miniCubeTimer ?? 300) - 1;
        if (!boss.miniCubes) boss.miniCubes = [];
        if (boss.miniCubeTimer <= 0) {
          boss.miniCubeTimer = 300 + Math.random() * 180;
          const ang = Math.random() * Math.PI * 2;
          boss.miniCubes.push({
            pos: { x: boss.pos.x, y: boss.pos.y },
            vel: {
              x: Math.cos(ang) * 0.8 + (state.ship.pos.x - boss.pos.x) * 0.003,
              y: Math.sin(ang) * 0.8 + (state.ship.pos.y - boss.pos.y) * 0.003,
            },
            hp: 1,
            rotAngle: Math.random() * Math.PI * 2,
          });
        }

        // Update mini cubes
        boss.miniCubes = boss.miniCubes.filter((mc) => {
          mc.pos.x += mc.vel.x;
          mc.pos.y += mc.vel.y;
          mc.rotAngle += 0.03;
          // Drift toward player slowly
          mc.vel.x += (state.ship.pos.x - mc.pos.x) * 0.0005;
          mc.vel.y += (state.ship.pos.y - mc.pos.y) * 0.0005;
          // Remove if off-screen
          return mc.pos.x > -50 && mc.pos.x < CANVAS_WIDTH + 50 && mc.pos.y > -50 && mc.pos.y < CANVAS_HEIGHT + 50;
        });

        // Mini cube collision with player bullets
        boss.miniCubes = boss.miniCubes.filter((mc) => {
          const hitIdx = state.bullets.findIndex(
            (b) => !b.isUFO && !b.isAlien && Math.hypot(b.pos.x - mc.pos.x, b.pos.y - mc.pos.y) < 12,
          );
          if (hitIdx >= 0) {
            state.bullets.splice(hitIdx, 1);
            spawnExplosion(mc.pos, "#00FF44", 4);
            bumpChain(state);
            const pts = Math.round(25 * killMultiplier(state));
            const prevScore = state.score;
            state.score += pts;
            awardExtraLives(state, prevScore);
            return false;
          }
          return true;
        });

        // Mini cube collision with player ship
        boss.miniCubes.forEach((mc) => {
          if (Math.hypot(mc.pos.x - state.ship.pos.x, mc.pos.y - state.ship.pos.y) < 18 && !state.ship.invulnerable) {
            // Damage player (handled by existing ship hit logic elsewhere, just remove the cube)
            mc.hp = 0;
          }
        });
        boss.miniCubes = boss.miniCubes.filter((mc) => mc.hp > 0);
      }
    }

    // Update flying saucer mini-saucer collisions with player bullets
    if (state.boss?.bossType === "flyingSaucer" && state.boss.miniSaucers) {
      state.bullets = state.bullets.filter((bullet) => {
        if (bullet.isUFO || bullet.isAlien) return true;
        let alive = true;
        state.boss!.miniSaucers = state.boss!.miniSaucers!.filter((ms) => {
          if (checkCollision(bullet.pos, 2, ms.pos, 10)) {
            alive = false;
            ms.hp--;
            if (ms.hp <= 0) {
              bumpChain(state);
              const pts = Math.round(200 * killMultiplier(state));
              const prevScore = state.score;
              state.score += pts;
              awardExtraLives(state, prevScore);
              setDisplayScore(state.score);
              spawnFloatingText(ms.pos, `+${pts}`, "#88FFAA", 14);
              spawnExplosion(ms.pos, "#88FFAA", 8);
              return false;
            }
          }
          return true;
        });
        return alive;
      });
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
          case "shield":
            state.powerUpActive.shield = SHIELD_DURATION;
            state.ship.invulnerable = true;
            // Preserve existing spawn invulnerability; only clear if shield duration is longer
            state.ship.invulnerableTime = Math.max(state.ship.invulnerableTime, SHIELD_DURATION);
            break;
          case "rapidFire":
            state.powerUpActive.rapidFire = RAPID_FIRE_DURATION;
            break;
          case "extraLife": {
            if (state.lives < BALANCE.MAX_LIVES) {
              state.lives++;
              setDisplayLives(state.lives);
            }
            break;
          }
          case "multiplier":
            state.powerUpActive.multiplier = MULTIPLIER_DURATION;
            break;
        }
        soundEffects.powerUp();
        addDebugLog(
          "powerup",
          `Picked up ${powerUp.type} at (${Math.round(powerUp.pos.x)}, ${Math.round(powerUp.pos.y)})`,
        );
        return false;
      }
      return powerUp.lifetime > 0;
    });

    // Chain combo decay
    if (state.chainTimer > 0) {
      state.chainTimer--;
      if (state.chainTimer === 0) {
        state.chain = 0;
      }
    }

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

    // === Unified bullet collision pass (single iteration over bullets) ===
    const newAsteroids: Asteroid[] = [];
    const killedAsteroids = new Set<Asteroid>();
    const killedUFOs = new Set<typeof state.ufos[number]>();
    const killedAliens = new Set<Alien>();

    state.bullets = state.bullets.filter((bullet) => {
      if (bullet.isUFO || bullet.isAlien) return true;

      // --- vs Asteroids ---
      for (const asteroid of state.asteroids) {
        if (killedAsteroids.has(asteroid)) continue;
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        if (checkCollision(bullet.pos, 2, asteroid.pos, radius)) {
          killedAsteroids.add(asteroid);
          bumpChain(state);
          const pts = Math.round(ASTEROID_POINTS[asteroid.size] * killMultiplier(state));
          const prevScore = state.score;
          state.score += pts;
          awardExtraLives(state, prevScore);
          setDisplayScore(state.score);
          gameStatsRef.current.asteroidsDestroyed++;
          const aColor = theme.asteroids[asteroid.size === "large" ? 0 : asteroid.size === "medium" ? 1 : 2];
          spawnFloatingText(asteroid.pos, `+${pts}`, aColor, 14);
          spawnExplosion(asteroid.pos, aColor, asteroid.size === "large" ? 15 : asteroid.size === "medium" ? 10 : 6);
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
          const powerUp = createPowerUp(asteroid.pos.x, asteroid.pos.y, asteroid.size === "large" ? "asteroidLarge" : asteroid.size === "medium" ? "asteroidMedium" : "asteroidSmall");
          if (powerUp) state.powerUps.push(powerUp);
          return false;
        }
      }

      // --- vs UFOs ---
      for (const ufo of state.ufos) {
        if (killedUFOs.has(ufo)) continue;
        const radius = ufo.size === "large" ? 20 : 10;
        if (checkCollision(bullet.pos, 2, ufo.pos, radius)) {
          killedUFOs.add(ufo);
          bumpChain(state);
          const pts = Math.round(UFO_POINTS[ufo.size] * killMultiplier(state));
          const prevScore = state.score;
          state.score += pts;
          awardExtraLives(state, prevScore);
          setDisplayScore(state.score);
          soundEffects.explode();
          spawnFloatingText(ufo.pos, `+${pts}`, "#FFFF66", 18);
          spawnExplosion(ufo.pos, "#FFFF66", 15);
          const powerUp = createPowerUp(ufo.pos.x, ufo.pos.y, ufo.size === "large" ? "ufoLarge" : "ufoSmall");
          if (powerUp) state.powerUps.push(powerUp);
          return false;
        }
      }

      // --- vs Aliens ---
      for (const alien of state.aliens) {
        if (killedAliens.has(alien) || alien.isInvisible) continue;
        const radius = alien.type === "brown" ? 12 : alien.type === "purpleSwarm" ? 8 : 14;
        if (checkCollision(bullet.pos, 2, alien.pos, radius)) {
          alien.hp--;
          if (alien.hp <= 0) {
            killedAliens.add(alien);
            bumpChain(state);
            const ptsMap: Record<string, number> = { brown: 300, greenMan: 500, blueSentinel: 600, purpleSwarm: 100 };
            const pts = Math.round((ptsMap[alien.type] ?? 300) * killMultiplier(state));
            const prevScore = state.score;
            state.score += pts;
            awardExtraLives(state, prevScore);
            setDisplayScore(state.score);
            soundEffects.explode();
            const colorMap: Record<string, string> = { brown: "#AA6633", greenMan: "#44FF44", blueSentinel: "#4488FF", purpleSwarm: "#AA44FF" };
            const color = colorMap[alien.type] ?? "#FFFFFF";
            spawnFloatingText(alien.pos, `+${pts}`, color, 16);
            spawnExplosion(alien.pos, color, 12);
            const powerUp = createPowerUp(alien.pos.x, alien.pos.y, "alien");
            if (powerUp) state.powerUps.push(powerUp);
          } else {
            spawnFloatingText(alien.pos, "HIT!", "#FFFFFF", 12);
          }
          return false;
        }
      }

      // --- vs Boss ---
      if (state.boss && state.boss.entered) {
        const bossHitRadius =
          state.boss.bossType === "amigaBall" ? 50 :
          state.boss.bossType === "flyingSaucer" ? 55 :
          state.boss.bossType === "borgCube" ? 50 : 60;
        if (checkCollision(bullet.pos, 2, state.boss.pos, bossHitRadius)) {
          state.boss.hp--;
          state.boss.hitFlash = 10;
          spawnExplosion(bullet.pos, "#FF88FF", 5);
          spawnFloatingText(bullet.pos, "HIT!", "#FF88FF", 14);
          if (state.boss.hp <= 0) {
            bumpChain(state);
            const pts = Math.round((2000 + state.wave * 200) * killMultiplier(state));
            const prevScore = state.score;
            state.score += pts;
            awardExtraLives(state, prevScore);
            setDisplayScore(state.score);
            spawnFloatingText(state.boss.pos, `+${pts}`, "#FFFF00", 24);
            spawnExplosion(state.boss.pos, "#FF44FF", 30);
            spawnExplosion(state.boss.pos, "#FFFF44", 20);
            soundEffects.explode();
            const bossDropType: PowerUp["type"] = pickWeighted({
              ...BALANCE.BOSS_DROP_WEIGHTS,
              extraLife: state.lives < BALANCE.MAX_LIVES ? BALANCE.BOSS_DROP_WEIGHTS.extraLife : 0,
            });
            state.powerUps.push({
              pos: { ...state.boss.pos },
              vel: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
              rotation: 0,
              type: bossDropType,
              lifetime: 600,
            });
            state.boss = null;
            state.bossDefeated = true;
            state.pendingNextWave = true;
            addDebugLog("boss", `Boss defeated! Score: +${pts}`);
          }
          return false;
        }
      }

      return true;
    });

    // Apply deferred entity removals from unified collision pass
    if (killedAsteroids.size > 0) state.asteroids = state.asteroids.filter((a) => !killedAsteroids.has(a));
    state.asteroids.push(...newAsteroids);
    if (killedUFOs.size > 0) state.ufos = state.ufos.filter((u) => !killedUFOs.has(u));
    if (killedAliens.size > 0) state.aliens = state.aliens.filter((a) => !killedAliens.has(a));

    // Collision: Ship vs Asteroids
    if (!state.ship.invulnerable && state.powerUpActive.shield === 0) {
      for (const asteroid of state.asteroids) {
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        if (checkCollision(state.ship.pos, SHIP_SIZE, asteroid.pos, radius)) {
          addDebugLog("collision", `Ship hit ${asteroid.size} asteroid`);
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
          addDebugLog("collision", `Ship hit ${ufo.size} UFO`);
          loseLife(state);
          break;
        }
      }
    }

    // Collision: Ship vs Aliens
    if (!state.ship.invulnerable && state.powerUpActive.shield === 0) {
      for (const alien of state.aliens) {
        const alienRadius = alien.type === "purpleSwarm" ? 8 : 12;
        if (alien.isInvisible) continue;
        if (checkCollision(state.ship.pos, SHIP_SIZE, alien.pos, alienRadius)) {
          addDebugLog("collision", `Ship hit ${alien.type} alien`);
          loseLife(state);
          break;
        }
      }
    }

    // Collision: Ship vs Boss
    if (state.boss && state.boss.entered && !state.ship.invulnerable && state.powerUpActive.shield === 0) {
      const boss = state.boss;
      const bossRadius =
        boss.bossType === "amigaBall"
          ? 50
          : boss.bossType === "flyingSaucer"
            ? 55
            : boss.bossType === "borgCube"
              ? 50
              : 65;
      if (boss && checkCollision(state.ship.pos, SHIP_SIZE, boss.pos, bossRadius)) {
        addDebugLog("collision", "Ship hit boss");
        loseLife(state);
      }
    }

    // Collision: Enemy bullets vs Ship
    if (!state.ship.invulnerable && state.powerUpActive.shield === 0) {
      state.bullets = state.bullets.filter((bullet) => {
        if (!bullet.isUFO && !bullet.isAlien) return true;
        if (checkCollision(bullet.pos, 2, state.ship.pos, SHIP_SIZE)) {
          addDebugLog("collision", `Ship hit by ${bullet.isUFO ? "UFO" : "alien"} bullet`);
          loseLife(state);
          return false;
        }
        return true;
      });
    }

    // Check wave completion
    const noEnemies =
      state.asteroids.length === 0 && state.ufos.length === 0 && state.aliens.length === 0 && !state.boss;
    if (noEnemies && !state.pendingNextWave) {
      nextWave();
    }
  }, [nextWave, loseLife, shootBullet, hyperspace, addDebugLog, bumpChain, killMultiplier, awardExtraLives]);

  // ===== SHARED BOSS DRAW HELPER =====
  const drawBossOnCanvas = (ctx: CanvasRenderingContext2D, boss: Boss, hpBarY: number) => {
    ctx.save();
    ctx.translate(boss.pos.x, boss.pos.y);

    if (boss.bossType === "tentacle") {
      const bossColor = boss.hitFlash > 0 ? "#FFFFFF" : "#FF44CC";
      const tentCount = boss.tentacles;
      for (let i = 0; i < tentCount; i++) {
        const baseAngle = (i / tentCount) * Math.PI * 2;
        ctx.strokeStyle = boss.hitFlash > 0 ? "#FFFFFF" : "#CC44AA";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const segments = 5;
        for (let s = 1; s <= segments; s++) {
          const d = s * 18;
          const w = Math.sin(boss.phase * 2 + i + s * 0.8) * 15;
          const tx = Math.cos(baseAngle) * d + Math.cos(baseAngle + Math.PI / 2) * w;
          const ty = Math.sin(baseAngle) * d + Math.sin(baseAngle + Math.PI / 2) * w;
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
    } else if (boss.bossType === "amigaBall") {
      const radius = 50;
      const rotAngle = boss.rotAngle ?? 0;
      const hitFlash = boss.hitFlash > 0;
      const ballCanvas = getAmigaBallCanvas(radius, rotAngle, hitFlash);
      ctx.drawImage(ballCanvas, -radius - 2, -radius - 2);
      // Shadow beneath ball
      ctx.save();
      ctx.translate(0, radius + 10);
      ctx.scale(1, 0.3);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (boss.bossType === "flyingSaucer") {
      const flash = boss.hitFlash > 0;
      ctx.fillStyle = flash ? "#FFFFFF" : "#446688";
      ctx.strokeStyle = flash ? "#FFFFFF" : "#88AACC";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -12, 25, 18, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = flash ? "#FFFFFF" : "#334455";
      ctx.strokeStyle = flash ? "#FFFFFF" : "#667788";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 55, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const lightCount = 8;
      for (let i = 0; i < lightCount; i++) {
        const lAngle = (i / lightCount) * Math.PI * 2 + boss.phase * 2;
        const lx = Math.cos(lAngle) * 45;
        const ly = Math.sin(lAngle) * 10;
        const brightness = (Math.sin(boss.phase * 3 + i) + 1) / 2;
        ctx.fillStyle = `rgba(255, ${flash ? 255 : Math.floor(200 * brightness)}, ${flash ? 255 : 0}, ${0.5 + brightness * 0.5})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (boss.tractorBeamActive) {
        ctx.save();
        ctx.globalAlpha = 0.15 + Math.sin(boss.phase * 5) * 0.1;
        const grad = ctx.createLinearGradient(0, 14, 0, 200);
        grad.addColorStop(0, "#00FF88");
        grad.addColorStop(1, "rgba(0,255,136,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-20, 14);
        ctx.lineTo(20, 14);
        ctx.lineTo(60, 200);
        ctx.lineTo(-60, 200);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      if (boss.miniSaucers) {
        boss.miniSaucers.forEach((ms) => {
          ctx.save();
          ctx.translate(ms.pos.x - boss.pos.x, ms.pos.y - boss.pos.y);
          ctx.fillStyle = "#556677";
          ctx.strokeStyle = "#88FFAA";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#88FFAA";
          ctx.beginPath();
          ctx.ellipse(0, -3, 6, 4, 0, Math.PI, 0);
          ctx.fill();
          ctx.restore();
        });
      }
    } else if (boss.bossType === "borgCube") {
      const flash = boss.hitFlash > 0;
      const cubeSize = 45;
      const rotX = boss.cubeRotX ?? 0;
      const rotY = boss.cubeRotY ?? 0;
      const verts = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
      ].map(([x, y, z]) => {
        const x2 = x * Math.cos(rotY) - z * Math.sin(rotY);
        const z2 = x * Math.sin(rotY) + z * Math.cos(rotY);
        const y2 = y * Math.cos(rotX) - z2 * Math.sin(rotX);
        const z3 = y * Math.sin(rotX) + z2 * Math.cos(rotX);
        const scale = 150 / (150 + z3 * cubeSize * 0.3);
        return { x: x2 * cubeSize * scale, y: y2 * cubeSize * scale };
      });
      const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#00FF44";
      ctx.beginPath();
      ctx.arc(0, 0, cubeSize * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = flash ? "#FFFFFF" : "#00FF44";
      ctx.lineWidth = 2;
      edges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(verts[a].x, verts[a].y);
        ctx.lineTo(verts[b].x, verts[b].y);
        ctx.stroke();
      });
      ctx.fillStyle = flash ? "#FFFFFF" : "#88FF88";
      verts.forEach((v) => {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      if (boss.miniCubes) {
        boss.miniCubes.forEach((mc) => {
          ctx.save();
          ctx.translate(mc.pos.x - boss.pos.x, mc.pos.y - boss.pos.y);
          ctx.rotate(mc.rotAngle);
          ctx.strokeStyle = "#00FF44";
          ctx.lineWidth = 1;
          const s = 8;
          ctx.strokeRect(-s / 2, -s / 2, s, s);
          ctx.strokeStyle = "rgba(0,255,68,0.4)";
          ctx.beginPath();
          ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0);
          ctx.moveTo(0, -s / 2); ctx.lineTo(0, s / 2);
          ctx.stroke();
          ctx.restore();
        });
      }
    }

    ctx.restore();

    // HP bar
    const bossBarColors: Record<string, string> = {
      tentacle: "#FF44CC", amigaBall: "#CC0000", flyingSaucer: "#00FF88", borgCube: "#00FF44",
    };
    const barW = 200, barH = 8;
    const barX = (CANVAS_WIDTH - barW) / 2;
    const hpFrac = boss.hp / boss.maxHp;
    const barColor = bossBarColors[boss.bossType] ?? "#FF44CC";
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = barColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, hpBarY, barW, barH);
    ctx.fillStyle = hpFrac > 0.3 ? barColor : "#FF0000";
    ctx.fillRect(barX, hpBarY, barW * hpFrac, barH);
    ctx.globalAlpha = 0.9;
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(BOSS_NAMES[boss.bossType] ?? "BOSS", CANVAS_WIDTH / 2, hpBarY - 4);
    ctx.restore();
  };

  // ===== STAR LAYER PRE-RENDER HELPER =====
  const buildStarLayerCanvases = (stars: Star[]) => {
    starLayerStarsRef.current = stars;
    for (let layer = 0; layer < 3; layer++) {
      const oc = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
      const octx = oc.getContext("2d")!;
      octx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      for (const star of stars) {
        if (star.layer !== layer) continue;
        octx.fillStyle = `rgba(200, 220, 255, ${star.brightness})`;
        octx.beginPath();
        octx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        octx.fill();
      }
      starLayerCanvasesRef.current[layer] = oc;
    }
  };

  // ===== AMIGA BALL PRE-RENDER HELPER =====
  const renderAmigaBall = (radius: number, rotAngle: number, hitFlash: boolean): OffscreenCanvas => {
    const size = radius * 2 + 4;
    const oc = new OffscreenCanvas(size, size);
    const octx = oc.getContext("2d")!;
    const lx = -0.5, ly = -0.7, lz = 0.5;
    const llen = Math.hypot(lx, ly, lz);
    const ldx = lx / llen, ldy = ly / llen, ldz = lz / llen;
    const step = 3;
    const cx = radius + 2, cy = radius + 2;
    for (let py = -radius; py < radius; py += step) {
      const xRange = Math.sqrt(radius * radius - py * py);
      for (let px = -xRange; px < xRange; px += step) {
        const nz = Math.sqrt(Math.max(0, radius * radius - px * px - py * py)) / radius;
        const nx = px / radius;
        const ny = py / radius;
        const theta = Math.atan2(ny, nx);
        const phi = Math.asin(Math.min(1, Math.max(-1, nz)));
        const u = (((theta + rotAngle) / Math.PI) * 4 + 100) % 1;
        const v = (((phi + Math.PI / 2) / Math.PI) * 4 + 100) % 1;
        const isRed = (Math.floor(u * 2) + Math.floor(v * 2)) % 2 === 0;
        const dot = nx * ldx + ny * ldy + nz * ldz;
        const diffuse = Math.max(0.15, dot);
        const reflZ = 2 * dot * nz - ldz;
        const spec = Math.pow(Math.max(0, reflZ), 20) * 0.6;
        let r: number, g: number, b: number;
        if (hitFlash) {
          r = g = b = 255;
        } else if (isRed) {
          r = Math.min(255, Math.floor(204 * diffuse + spec * 255));
          g = Math.min(255, Math.floor(spec * 255));
          b = Math.min(255, Math.floor(spec * 255));
        } else {
          r = Math.min(255, Math.floor(255 * diffuse + spec * 255));
          g = Math.min(255, Math.floor(255 * diffuse + spec * 255));
          b = Math.min(255, Math.floor(255 * diffuse + spec * 255));
        }
        octx.fillStyle = `rgb(${r},${g},${b})`;
        octx.fillRect(cx + px - step / 2, cy + py - step / 2, step, step);
      }
    }
    return oc;
  };

  const getAmigaBallCanvas = (radius: number, rotAngle: number, hitFlash: boolean): OffscreenCanvas => {
    const cache = amigaBallCacheRef.current;
    const ROT_THRESHOLD = (2 * Math.PI) / 180; // 2 degrees
    if (
      cache &&
      Math.abs(cache.lastRotAngle - rotAngle) < ROT_THRESHOLD &&
      cache.lastHitFlash === hitFlash
    ) {
      return cache.canvas;
    }
    const canvas = renderAmigaBall(radius, rotAngle, hitFlash);
    amigaBallCacheRef.current = { canvas, lastRotAngle: rotAngle, lastHitFlash: hitFlash };
    return canvas;
  };

  // ===== DRAW SHIP HELPER =====
  const drawShip = (ctx: CanvasRenderingContext2D, ship: Ship, color: string, label?: string) => {
    ctx.save();
    ctx.translate(ship.pos.x, ship.pos.y);
    ctx.rotate(ship.rotation);
    if (!ship.invulnerable || Math.floor(drawTimestampRef.current / 100) % 2 === 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(SHIP_SIZE, 0);
      ctx.lineTo(-SHIP_SIZE, -SHIP_SIZE / 2);
      ctx.lineTo(-SHIP_SIZE / 2, 0);
      ctx.lineTo(-SHIP_SIZE, SHIP_SIZE / 2);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
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
  const drawCommon = (
    ctx: CanvasRenderingContext2D,
    stars: Star[],
    particles: Particle[],
    floatingTexts: FloatingText[],
    asteroids: Asteroid[],
    aliens: Alien[],
    bgColor: string,
    asteroidColors: string[],
  ) => {
    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Parallax starfield (using pre-rendered layer canvases for performance)
    const time = drawTimestampRef.current * 0.001;
    if (starLayerStarsRef.current !== stars) {
      buildStarLayerCanvases(stars);
    }
    const PARALLAX_SPEEDS = [0.1, 0.3, 0.6];
    for (let layer = 0; layer < 3; layer++) {
      const layerCanvas = starLayerCanvasesRef.current[layer];
      if (!layerCanvas) continue;
      const offsetX = Math.round((time * PARALLAX_SPEEDS[layer] * 10) % CANVAS_WIDTH);
      // Composite twice to handle wrap-around
      ctx.save();
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(time * 2 * (layer + 1));
      ctx.drawImage(layerCanvas, -offsetX, 0);
      if (offsetX > 0) ctx.drawImage(layerCanvas, CANVAS_WIDTH - offsetX, 0);
      ctx.restore();
    }

    // Particles (no shadow for performance)
    particles.forEach((p) => {
      const alpha = p.lifetime / p.maxLifetime;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Asteroids (no shadow for performance)
    asteroids.forEach((asteroid) => {
      ctx.save();
      ctx.translate(asteroid.pos.x, asteroid.pos.y);
      ctx.rotate(asteroid.rotation);
      const colorIdx = asteroid.size === "large" ? 0 : asteroid.size === "medium" ? 1 : 2;
      const color = asteroidColors[colorIdx];
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      asteroid.points.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });

    // Brown aliens
    aliens
      .filter((a) => a.type === "brown")
      .forEach((alien) => {
        ctx.save();
        ctx.translate(alien.pos.x, alien.pos.y);
        ctx.rotate(Math.atan2(alien.vel.y, alien.vel.x));
        ctx.strokeStyle = "#AA6633";
        ctx.fillStyle = "#553311";
        ctx.lineWidth = 2;
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
    aliens
      .filter((a) => a.type === "greenMan")
      .forEach((alien) => {
        ctx.save();
        ctx.translate(alien.pos.x, alien.pos.y);
        ctx.strokeStyle = "#44FF44";
        ctx.fillStyle = "#115511";
        ctx.lineWidth = 2;
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

    // Red Drones removed

    // Blue Sentinels
    aliens
      .filter((a) => a.type === "blueSentinel")
      .forEach((alien) => {
        if (alien.isInvisible) {
          // Draw faint shimmer when invisible
          ctx.save();
          ctx.translate(alien.pos.x, alien.pos.y);
          ctx.globalAlpha = 0.15;
          ctx.strokeStyle = "#4488FF";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          return;
        }
        // Draw charge rings before teleport
        if (alien.chargeTimer && alien.chargeTimer > 0) {
          ctx.save();
          ctx.translate(alien.pos.x, alien.pos.y);
          const chargeProgress = 1 - alien.chargeTimer / 30;
          for (let ring = 0; ring < 3; ring++) {
            ctx.globalAlpha = 0.3 + chargeProgress * 0.4 - ring * 0.1;
            ctx.strokeStyle = "#4488FF";
            ctx.lineWidth = 2 - ring * 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, 8 + chargeProgress * (15 + ring * 8), 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.save();
        ctx.translate(alien.pos.x, alien.pos.y);
        // Diamond/crystal shape - glow brighter during charge
        const isCharging = alien.chargeTimer && alien.chargeTimer > 0;
        ctx.strokeStyle = isCharging ? "#88CCFF" : "#4488FF";
        ctx.fillStyle = "#112244";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 14);
        ctx.lineTo(-10, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Inner glow
        ctx.strokeStyle = "#88CCFF";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(5, 0);
        ctx.lineTo(0, 8);
        ctx.lineTo(-5, 0);
        ctx.closePath();
        ctx.stroke();
        // Eye
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(0, -2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4488FF";
        ctx.beginPath();
        ctx.arc(0, -2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

    // Purple Swarm
    aliens
      .filter((a) => a.type === "purpleSwarm")
      .forEach((alien) => {
        ctx.save();
        ctx.translate(alien.pos.x, alien.pos.y);
        const wobble = Math.sin(alien.zigzagPhase * 5) * 0.3;
        ctx.rotate(Math.atan2(alien.vel.y, alien.vel.x) + wobble);
        // Small insect-like shape
        ctx.strokeStyle = "#AA44FF";
        ctx.fillStyle = "#440066";
        ctx.lineWidth = 1.5;
        // Body
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Wings
        ctx.fillStyle = "rgba(170, 68, 255, 0.3)";
        ctx.beginPath();
        ctx.ellipse(-2, -5, 4, 3, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-2, 5, 4, 3, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Antenna
        ctx.strokeStyle = "#CC66FF";
        ctx.beginPath();
        ctx.moveTo(5, -2);
        ctx.lineTo(9, -5);
        ctx.moveTo(5, 2);
        ctx.lineTo(9, 5);
        ctx.stroke();
        ctx.restore();
      });

    // Floating texts
    floatingTexts.forEach((ft) => {
      ctx.save();
      ctx.globalAlpha = ft.opacity;
      ctx.font = `${ft.size}px 'Press Start 2P', monospace`;
      ctx.fillStyle = ft.color;
      ctx.textAlign = "center";
      ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
      ctx.restore();
    });

    // CRT scanline overlay (cached offscreen canvas)
    ctx.save();
    if (menuScanlineCanvasRef.current) {
      ctx.globalAlpha = 0.03;
      ctx.drawImage(menuScanlineCanvasRef.current, 0, 0);
    }
    if (menuVignetteGradientRef.current) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = menuVignetteGradientRef.current;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    ctx.restore();
  };

  // ===== DRAW BULLETS HELPER =====
  const drawBullets = (ctx: CanvasRenderingContext2D, bullets: Bullet[], defaultColor: string) => {
    bullets.forEach((bullet) => {
      ctx.save();
      const bColor = bullet.color || defaultColor;
      ctx.fillStyle = bColor;
      ctx.beginPath();
      ctx.arc(bullet.pos.x, bullet.pos.y, bullet.isUFO || bullet.isAlien ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
      // Soft glow circle (no shadowBlur)
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(bullet.pos.x, bullet.pos.y, bullet.isUFO || bullet.isAlien ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    });
  };

  const draw = useCallback((rafTimestamp: number) => {
    drawTimestampRef.current = rafTimestamp;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!ctx2dRef.current) {
      ctx2dRef.current = canvas.getContext("2d");
    }
    const ctx = ctx2dRef.current;
    if (!ctx) return;
    ensureCachedOverlays(ctx);

    if ((gameModeRef.current === "duel" || gameModeRef.current === "online") && duelStateRef.current) {
      const ds = duelStateRef.current;
      drawCommon(ctx, ds.stars, ds.particles, ds.floatingTexts, ds.asteroids, ds.aliens, "#050510", [
        "#FFFFFF",
        "#88DDFF",
        "#44AAFF",
      ]);

      // Draw ships
      const duelLabel1 = gameModeRef.current === "online" ? (multiplayer.playerInitialsMap.get(0) ?? "P1") : "P1";
      const duelLabel2 = gameModeRef.current === "online" ? (multiplayer.playerInitialsMap.get(1) ?? "P2") : "P2";
      if (ds.respawnTimer[0] === 0) drawShip(ctx, ds.ship1, P1_COLOR, duelLabel1);
      if (ds.respawnTimer[1] === 0) drawShip(ctx, ds.ship2, P2_COLOR, duelLabel2);

      // Draw bullets
      drawBullets(ctx, ds.bullets1, P1_COLOR);
      drawBullets(ctx, ds.bullets2, P2_COLOR);

      return;
    }

    if ((gameModeRef.current === "coop" || gameModeRef.current === "online_coop") && coopStateRef.current) {
      const cs = coopStateRef.current;
      const coopTheme = getTheme(cs.wave);
      drawCommon(
        ctx,
        cs.stars,
        cs.particles,
        cs.floatingTexts,
        cs.asteroids,
        cs.aliens,
        coopTheme.bg,
        coopTheme.asteroids,
      );

      // Draw all players' ships
      const pc = cs.playerCount ?? cs.ships.length;
      for (let i = 0; i < pc && i < cs.ships.length; i++) {
        if (cs.eliminated[i]) continue;
        if (cs.respawnTimer[i] === 0) {
          const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
          const shielded = cs.powerUpActive?.[i]?.shield > 0;
          const shipLabel = multiplayer.playerInitialsMap.get(i) ?? `P${i + 1}`;
          drawShip(ctx, cs.ships[i], shielded ? "#7FFF7F" : color, shipLabel);
        }
      }

      // Draw all players' bullets
      for (let i = 0; i < pc && i < cs.bullets.length; i++) {
        drawBullets(ctx, cs.bullets[i], PLAYER_COLORS[i % PLAYER_COLORS.length]);
      }
      // Draw boss bullets in a distinct orange-red colour
      if (cs.bossBullets?.length) {
        drawBullets(ctx, cs.bossBullets, "#FF4400");
      }
      // Draw alien bullets in green/cyan colour
      if (cs.alienBullets?.length) {
        drawBullets(ctx, cs.alienBullets, "#44FF44");
      }

      // Draw power-ups on the field
      (cs.powerUps ?? []).forEach((powerUp) => {
        ctx.save();
        ctx.translate(powerUp.pos.x, powerUp.pos.y);
        ctx.rotate(powerUp.rotation);
        const color =
          powerUp.type === "shield"
            ? "#7FFF7F"
            : powerUp.type === "rapidFire"
              ? "#FF6666"
              : powerUp.type === "multiplier"
                ? "#FFFF66"
                : "#CC66FF";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
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
        ctx.rotate(-powerUp.rotation);
        ctx.fillStyle = color;
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const icon =
          powerUp.type === "shield"
            ? "SH"
            : powerUp.type === "rapidFire"
              ? "RF"
              : powerUp.type === "extraLife"
                ? "+1"
                : "2X";
        ctx.fillText(icon, 0, 0);
        ctx.restore();
      });

      // Draw UFOs (same graphics as solo mode)
      (cs.ufos ?? []).forEach((ufo) => {
        ctx.save();
        ctx.translate(ufo.pos.x, ufo.pos.y);
        const ufoColor = ufo.size === "large" ? coopTheme.enemy : "#FF44FF";
        ctx.strokeStyle = ufoColor;
        ctx.lineWidth = 2;
        const radius = ufo.size === "large" ? 20 : 10;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, -radius / 4, radius / 2, radius / 3, 0, 0, Math.PI, true);
        ctx.stroke();
        const pulse = 0.3 + Math.sin(drawTimestampRef.current * 0.005) * 0.2;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = ufoColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      });

      // Draw boss using shared helper
      if (cs.boss) {
        drawBossOnCanvas(ctx, cs.boss, CANVAS_HEIGHT - 48);
      }

      // Power-up active HUD bars (for my own ship in online, all in local)
      const myIdx = multiplayer.playerIdxRef.current;
      const myPa = cs.powerUpActive?.[myIdx];
      if (myPa) {
        const activePowerUps: { label: string; color: string; remaining: number; max: number }[] = [];
        if (myPa.shield > 0)
          activePowerUps.push({ label: "SHIELD", color: "#7FFF7F", remaining: myPa.shield, max: 300 });
        if (myPa.rapidFire > 0)
          activePowerUps.push({ label: "RAPID", color: "#FF6666", remaining: myPa.rapidFire, max: 600 });
        if (myPa.multiplier > 0)
          activePowerUps.push({ label: "2x", color: "#FFFF66", remaining: myPa.multiplier, max: 900 });
        activePowerUps.forEach((pu, i) => {
          const barX = 10,
            barY = 10 + i * 18,
            barW = 120,
            barH = 12;
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
          ctx.fillText(pu.label, barX + 3, barY + 10);
          ctx.restore();
        });
      }

      // Hyperspace cooldown indicator for own ship
      const myHsCooldown = cs.hyperspaceCooldown?.[myIdx] ?? 0;
      if (myHsCooldown > 0) {
        const chargePercent = Math.round(((600 - myHsCooldown) / 600) * 100);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.font = "7px 'Press Start 2P', monospace";
        ctx.fillStyle = "#88FFFF";
        ctx.textAlign = "right";
        ctx.fillText(`HYPER ${chargePercent}%`, CANVAS_WIDTH - 10, 18);
        ctx.restore();
      }

      // Wave/theme indicator
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.font = "8px 'Press Start 2P', monospace";
      ctx.fillStyle = coopTheme.accent;
      ctx.textAlign = "right";
      ctx.fillText(`${coopTheme.name.toUpperCase()} ZONE`, CANVAS_WIDTH - 10, cs.boss ? 58 : 38);
      ctx.restore();

      // Wave complete banner
      if (cs.waveComplete) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.font = "22px 'Press Start 2P', monospace";
        ctx.fillStyle = "#44FF88";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`WAVE ${cs.wave} CLEAR!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.globalAlpha = 0.5;
        ctx.font = "12px 'Press Start 2P', monospace";
        ctx.fillText("Next wave incoming…", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
        ctx.restore();
      }

      // Game over overlay – handled by HTML overlay below (coopGameOver state)

      // Spectator overlay for eliminated players in online coop
      if (gameModeRef.current === "online_coop" && !isHostRef.current) {
        const myI = multiplayer.playerIdxRef.current;
        if (cs.eliminated[myI]) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = "#000000";
          ctx.fillRect(CANVAS_WIDTH / 2 - 130, CANVAS_HEIGHT - 55, 260, 20);
          ctx.globalAlpha = 0.9;
          ctx.font = "8px 'Press Start 2P', monospace";
          ctx.fillStyle = "#FF4444";
          ctx.textAlign = "center";
          ctx.fillText("YOU WERE ELIMINATED — SPECTATING", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40);
          ctx.restore();
        }
      }

      // NOTE: fall through to draw nectarine overlay / CRT effects below
    } else if (!gameStateRef.current) {
      // No game state at all: skip solo drawing but still draw CRT/nectarine
    } else {
      const state = gameStateRef.current;
      const theme = getTheme(state.wave);

      drawCommon(
        ctx,
        state.stars,
        state.particles,
        state.floatingTexts,
        state.asteroids,
        state.aliens,
        theme.bg,
        theme.asteroids,
      );

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
        const radius = ufo.size === "large" ? 20 : 10;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, -radius / 4, radius / 2, radius / 3, 0, 0, Math.PI, true);
        ctx.stroke();
        const pulse = 0.3 + Math.sin(drawTimestampRef.current * 0.005) * 0.2;
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
        drawBossOnCanvas(ctx, state.boss, CANVAS_HEIGHT - 30);
      }

      // Power-ups
      state.powerUps.forEach((powerUp) => {
        ctx.save();
        ctx.translate(powerUp.pos.x, powerUp.pos.y);
        ctx.rotate(powerUp.rotation);
        const color =
          powerUp.type === "shield"
            ? "#7FFF7F"
            : powerUp.type === "rapidFire"
              ? "#FF6666"
              : powerUp.type === "multiplier"
                ? "#FFFF66"
                : "#CC66FF";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
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
        const icon =
          powerUp.type === "shield"
            ? "SH"
            : powerUp.type === "rapidFire"
              ? "RF"
              : powerUp.type === "extraLife"
                ? "+1"
                : "2X";
        ctx.fillText(icon, 0, 0);
        ctx.restore();
      });

      // Power-up HUD bars
      const activePowerUps: { label: string; color: string; remaining: number; max: number }[] = [];
      if (state.powerUpActive.shield > 0)
        activePowerUps.push({ label: "SHIELD", color: "#7FFF7F", remaining: state.powerUpActive.shield, max: 300 });
      if (state.powerUpActive.rapidFire > 0)
        activePowerUps.push({ label: "RAPID", color: "#FF6666", remaining: state.powerUpActive.rapidFire, max: 600 });
      if (state.powerUpActive.multiplier > 0)
        activePowerUps.push({ label: "2x", color: "#FFFF66", remaining: state.powerUpActive.multiplier, max: 900 });

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

      // Top score in top-right corner (from local high scores)
      const topScoreSource = localHighScores.length > 0 ? localHighScores : leaderboard;
      if (topScoreSource.length > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.font = "8px 'Press Start 2P', monospace";
        ctx.fillStyle = "#FFD700";
        ctx.textAlign = "right";
        ctx.fillText(`TOP: ${topScoreSource[0].score.toString().padStart(8, "0")}`, CANVAS_WIDTH - 10, 38);
        ctx.restore();
      }

      // Chain combo indicator (solo only)
      if (state.chain >= 2) {
        const chainMult = Math.min(1 + state.chain * CHAIN_STEP, CHAIN_MAX);
        const chainText = `x${chainMult.toFixed(1)} CHAIN`;
        ctx.save();
        const pulse = state.chainTimer > CHAIN_WINDOW - 10 ? 0.2 : 0;
        const scale = 1 + Math.min(state.chain, 30) * 0.02 + pulse;
        ctx.font = `${Math.round(10 * scale)}px 'Press Start 2P', monospace`;
        let chainWidth: number;
        if (chainTextCacheRef.current?.text === chainText) {
          chainWidth = chainTextCacheRef.current.width;
        } else {
          chainWidth = ctx.measureText(chainText).width;
          chainTextCacheRef.current = { text: chainText, width: chainWidth };
        }
        const chainY = 10 + activePowerUps.length * 18 + 16;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#FFAA33";
        ctx.textAlign = "left";
        ctx.fillText(chainText, 10, chainY);
        ctx.globalAlpha = 0.6;
        ctx.fillRect(10, chainY + 5, Math.max(0, chainWidth * (state.chainTimer / CHAIN_WINDOW)), 3);
        ctx.restore();
      }

    } // end of else (solo mode drawing)

    // Version number removed from canvas (moved to HUD)

    // Now playing marquee at bottom of canvas
    const np = nowPlayingRef.current;
    if (np) {
      ctx.save();
      ctx.font = "13px 'Press Start 2P', monospace";
      const npText = `* ${np.artist} -- ${np.title}   `;

      // Measure width only when the text changes
      let npTextWidth: number;
      if (nowPlayingTextCacheRef.current?.text === npText) {
        npTextWidth = nowPlayingTextCacheRef.current.width;
      } else {
        npTextWidth = ctx.measureText(npText).width;
        nowPlayingTextCacheRef.current = { text: npText, width: npTextWidth };
      }

      // Advance marquee position
      nowPlayingMarqueeXRef.current -= MARQUEE_SPEED;
      if (nowPlayingMarqueeXRef.current < -npTextWidth) {
        nowPlayingMarqueeXRef.current = CANVAS_WIDTH;
      }
      // Clip to bottom strip
      ctx.beginPath();
      ctx.rect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
      ctx.clip();
      // Demoscene glow backdrop (cached gradient)
      if (marqueeGradientRef.current) {
        ctx.fillStyle = marqueeGradientRef.current;
        ctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
      }
      // Glow text effect (no shadowBlur)
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#AAEEFF";
      ctx.textAlign = "left";
      ctx.fillText(npText, nowPlayingMarqueeXRef.current, CANVAS_HEIGHT - 9);
      ctx.restore();
    }

    // Oneliner marquee near top of canvas
    const olEntries = onelinerRef.current;
    if (olEntries && olEntries.length > 0) {
      ctx.save();
      ctx.font = "11px 'Press Start 2P', monospace";
      const separator = "          |          ";
      const olText =
        olEntries.map((e) => `${e.flag ? e.flag + " " : ""}[${e.author}] ${e.message}`).join(separator) + "   ";

      // Measure total width including GIF replacements
      const gifTokens = [":necta:", ":nectawall:", "d^^b", ":D", ":he-man:"];
      const gifHeight = 14;

      // Calculate total width (cached — only recompute when olText changes)
      let totalWidth: number;
      if (olTextCacheRef.current?.text === olText) {
        totalWidth = olTextCacheRef.current.totalWidth;
      } else {
        totalWidth = 0;
        let remaining = olText;
        while (remaining.length > 0) {
          let earliestIdx = remaining.length;
          let earliestToken = "";
          for (const token of gifTokens) {
            const idx = remaining.indexOf(token);
            if (idx !== -1 && idx < earliestIdx) {
              earliestIdx = idx;
              earliestToken = token;
            }
          }
          if (earliestToken) {
            totalWidth += ctx.measureText(remaining.substring(0, earliestIdx)).width;
            totalWidth += gifHeight; // GIF width = height (square)
            remaining = remaining.substring(earliestIdx + earliestToken.length);
          } else {
            totalWidth += ctx.measureText(remaining).width;
            remaining = "";
          }
        }
        olTextCacheRef.current = { text: olText, totalWidth };
      }

      // Advance marquee position
      onelinerMarqueeXRef.current -= MARQUEE_SPEED;
      if (onelinerMarqueeXRef.current < -totalWidth) {
        onelinerMarqueeXRef.current = CANVAS_WIDTH;
      }
      // Clip to top strip
      ctx.beginPath();
      ctx.rect(0, 18, CANVAS_WIDTH, 22);
      ctx.clip();
      // Demoscene glow backdrop (cached gradient)
      if (olMarqueeGradientRef.current) {
        ctx.fillStyle = olMarqueeGradientRef.current;
        ctx.fillRect(0, 18, CANVAS_WIDTH, 22);
      }
      // Draw text with inline GIFs (no shadowBlur)
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#FFE066";
      ctx.textAlign = "left";

      let drawX = onelinerMarqueeXRef.current;
      let remaining = olText;
      while (remaining.length > 0) {
        let earliestIdx = remaining.length;
        let earliestToken = "";
        for (const token of gifTokens) {
          const idx = remaining.indexOf(token);
          if (idx !== -1 && idx < earliestIdx) {
            earliestIdx = idx;
            earliestToken = token;
          }
        }
        if (earliestToken) {
          const beforeText = remaining.substring(0, earliestIdx);
          if (beforeText) {
            ctx.fillText(beforeText, drawX, 35);
            drawX += ctx.measureText(beforeText).width;
          }
          const gifImg = onelinerGifsRef.current[earliestToken];
          if (gifImg && gifImg.complete) {
            ctx.drawImage(gifImg, drawX, 22, gifHeight, gifHeight);
          }
          drawX += gifHeight;
          remaining = remaining.substring(earliestIdx + earliestToken.length);
        } else {
          ctx.fillText(remaining, drawX, 35);
          remaining = "";
        }
      }
      ctx.restore();
    }

    // ===== CRT / SCANLINE OVERLAY (cached offscreen canvas) =====
    ctx.save();
    if (scanlineCanvasRef.current) {
      ctx.globalAlpha = 0.06;
      ctx.drawImage(scanlineCanvasRef.current, 0, 0);
    }
    if (vignetteGradientRef.current) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = vignetteGradientRef.current;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    ctx.restore();
  }, []);

  const gameLoop = useCallback(
    (currentTime: number) => {
      // --- 60 FPS render cap ---
      if (
        lastFrameTimeRef.current !== 0 &&
        currentTime - lastFrameTimeRef.current < FRAME_MIN_TIME - FRAME_TIME_TOLERANCE
      ) {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      const deltaTime = currentTime - lastTimeRef.current;
      lastTimeRef.current = currentTime;
      lastFrameTimeRef.current = currentTime;

      // Cap delta to prevent "spiral of death" after pauses / tab switches
      const cappedDelta = Math.min(deltaTime, 250);

      let updatesThisFrame = 0;

      if (gameModeRef.current === "online" || gameModeRef.current === "online_coop") {
        // Online: the worker owns game physics; we just send inputs and render
        const keys = keysRef.current;
        const gp0 = readGamepad(0);
        const b = controlBindingsRef.current;
        const localInput = {
          left: keys[b.p1.left] || gp0.left,
          right: keys[b.p1.right] || gp0.right,
          up: keys[b.p1.thrust] || gp0.up,
          fire: keys[b.p1.fire] || gp0.fire,
          hyperspace: !!(keys[b.p1.hyperspace] || gp0.hyperspace),
        };

        // Sound effects for online co-op local player
        if (gameModeRef.current === "online_coop") {
          if (localInput.up && !prevCoopThrustRef.current) soundEffects.startThrust();
          else if (!localInput.up && prevCoopThrustRef.current) soundEffects.stopThrust();
          prevCoopThrustRef.current = localInput.up;
          if (localInput.fire && !prevCoopFireRef.current) soundEffects.shoot();
          prevCoopFireRef.current = localInput.fire;
          if (localInput.hyperspace && !prevCoopHyperspaceRef.current) soundEffects.warpCharge?.();
          prevCoopHyperspaceRef.current = localInput.hyperspace;
        }

        if (isHostRef.current && workerRef.current && gameModeRef.current === "online_coop") {
          // Coop host: collect all remote inputs and send full array to worker
          const cs = coopStateRef.current;
          const pc = cs?.playerCount ?? 2;
          const inputsArr: { left: boolean; right: boolean; up: boolean; fire: boolean; hyperspace: boolean }[] = [
            localInput,
          ];
          for (let i = 1; i < pc; i++) {
            const remote = multiplayer.remoteInputsRef.current.get(i);
            inputsArr.push(
              remote
                ? { ...remote, hyperspace: remote.hyperspace ?? false }
                : { left: false, right: false, up: false, fire: false, hyperspace: false },
            );
          }
          workerRef.current.postMessage({ type: "inputs", inputs: inputsArr });
        } else if (isHostRef.current && workerRef.current) {
          // Duel host
          workerRef.current.postMessage({
            type: "inputs",
            p1: localInput,
            p2: multiplayer.remoteInputRef.current,
          });
        }
        if (!isHostRef.current && isConnectedRef.current) {
          // Apply inputs locally to the predicted ship for zero-feel latency
          const pred = guestPredictedShipRef.current;
          if (pred) {
            const turnSpeed = controlBindingsRef.current.turnSpeed || DEFAULT_TURN_SPEED;
            if (localInput.left) pred.rotation -= turnSpeed;
            if (localInput.right) pred.rotation += turnSpeed;
            pred.isThrusting = localInput.up;
            if (localInput.up) {
              pred.vel.x += Math.cos(pred.rotation) * 0.08;
              pred.vel.y += Math.sin(pred.rotation) * 0.08;
            }
            const maxSpeed = 8;
            const sp = Math.hypot(pred.vel.x, pred.vel.y);
            if (sp > maxSpeed) {
              pred.vel.x = (pred.vel.x / sp) * maxSpeed;
              pred.vel.y = (pred.vel.y / sp) * maxSpeed;
            }
            pred.vel.x *= 0.99;
            pred.vel.y *= 0.99;
            pred.pos.x = (((pred.pos.x + pred.vel.x) % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH;
            pred.pos.y = (((pred.pos.y + pred.vel.y) % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT;
            // Mirror predicted position into the render state for immediate visual feedback
            const ds = duelStateRef.current;
            const cs = coopStateRef.current;
            if (ds) {
              ds.ship2.pos = { ...pred.pos };
              ds.ship2.rotation = pred.rotation;
              ds.ship2.isThrusting = pred.isThrusting;
            }
            if (cs) {
              const myIdx = multiplayer.playerIdxRef.current;
              if (cs.ships[myIdx]) {
                cs.ships[myIdx].pos = { ...pred.pos };
                cs.ships[myIdx].rotation = pred.rotation;
                cs.ships[myIdx].isThrusting = pred.isThrusting;
              }
            }
          }
          // Throttle input sends to ~20 Hz to reduce channel flood
          if (currentTime - lastInputSentRef.current >= ONLINE_INPUT_SEND_INTERVAL_MS) {
            lastInputSentRef.current = currentTime;
            multiplayer.sendInputs(localInput, multiplayer.playerIdxRef.current);
          }
        }
        updateOnlineVisuals();
        // Physics run in the worker; updatesThisFrame stays 0 (already initialised)
      } else if (gameModeRef.current === "coop") {
        // Local co-op: both players' inputs sent to the co-op worker
        const keys = keysRef.current;
        const gp0 = readGamepad(0);
        const gp1 = readGamepad(1);
        const b = controlBindingsRef.current;
        const p1Up = keys[b.p1.thrust] || gp0.up;
        const p1Fire = keys[b.p1.fire] || gp0.fire;
        const p1Hyperspace = !!(keys[b.p1.hyperspace] || gp0.hyperspace);

        // Sound effects for local co-op (P1 is the primary local player)
        if (p1Up && !prevCoopThrustRef.current) soundEffects.startThrust();
        else if (!p1Up && prevCoopThrustRef.current) soundEffects.stopThrust();
        prevCoopThrustRef.current = p1Up;
        if (p1Fire && !prevCoopFireRef.current) soundEffects.shoot();
        prevCoopFireRef.current = p1Fire;
        if (p1Hyperspace && !prevCoopHyperspaceRef.current) soundEffects.warpCharge?.();
        prevCoopHyperspaceRef.current = p1Hyperspace;

        if (workerRef.current) {
          workerRef.current.postMessage({
            type: "inputs",
            inputs: [
              {
                left: keys[b.p1.left] || gp0.left,
                right: keys[b.p1.right] || gp0.right,
                up: p1Up,
                fire: p1Fire,
                hyperspace: p1Hyperspace,
              },
              {
                left: keys[b.p2.left] || gp1.left,
                right: keys[b.p2.right] || gp1.right,
                up: keys[b.p2.thrust] || gp1.up,
                fire: keys[b.p2.fire] || gp1.fire,
                hyperspace: !!(keys[b.p2.hyperspace] || gp1.hyperspace),
              },
            ],
          });
        }
        updateOnlineVisuals();
        // Physics run in the worker; updatesThisFrame stays 0 (already initialised)
      } else {
        // Solo / Duel: fixed timestep accumulator – game logic always runs at 60 Hz
        accumulatorRef.current += cappedDelta;
        while (accumulatorRef.current >= FIXED_TIMESTEP) {
          if (gameModeRef.current === "duel") {
            updateDuel();
          } else if (gameModeRef.current === "solo") {
            update();
          }
          accumulatorRef.current -= FIXED_TIMESTEP;
          updatesThisFrame++;
        }
      }

      draw(currentTime);

      // FPS tracking for overlay – writes to module-level counters (no setState)
      _fps.frames++;
      _fps.updates += updatesThisFrame;

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    },
    [update, updateDuel, draw, updateOnlineVisuals, multiplayer.sendInputs],
  );

  useEffect(() => {
    enteringInitialsRef.current = enteringInitials;
  }, [enteringInitials]);

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
    const mql = window.matchMedia("(any-pointer: fine)");
    const handleChange = (event: MediaQueryListEvent) => setCanUseKeyboard(event.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const handleRadioPause = useCallback(() => {
    setIsRadioPlaying(false);
    setUserPaused(true);
    setAutoPlayMusic(false);
  }, []);

  const handleRadioPlay = useCallback(() => {
    setIsRadioPlaying(true);
    setUserPaused(false);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleError = () => console.error("Audio loading error:", audio.error?.message);
    setIsRadioPlaying(!audio.paused);
    audio.addEventListener("play", handleRadioPlay);
    audio.addEventListener("pause", handleRadioPause);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("play", handleRadioPlay);
      audio.removeEventListener("pause", handleRadioPause);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => () => {
    if (quitConfirmTimerRef.current) clearTimeout(quitConfirmTimerRef.current);
  }, []);

  // Persist autoPlayMusic setting
  useEffect(() => {
    localStorage.setItem("autoPlayMusic", String(autoPlayMusic));
    if (audioRef.current) {
      if (autoPlayMusic) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, [autoPlayMusic]);

  // Try to autoplay radio on first user interaction (browsers block autoplay without gesture)
  useEffect(() => {
    if (!autoPlayMusic) return;
    const tryPlay = () => {
      if (radioStartedRef.current) return;
      if (audioRef.current) {
        audioRef.current
          .play()
          .then(() => {
            radioStartedRef.current = true;
          })
          .catch(() => {
            /* still blocked, will retry on next interaction */
          });
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
  }, [autoPlayMusic]);

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
          const artistName =
            Array.from(artists)
              .map((a) => a.textContent)
              .join(" & ") || "Unknown";
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

  // Preload oneliner GIFs
  useEffect(() => {
    const gifMap: Record<string, string> = {
      ":necta:": "/images/necta.gif",
      ":nectawall:": "/images/nectawall.gif",
      "d^^b": "/images/headphones.gif",
      ":D": "/images/D.gif",
      ":he-man:": "/images/he-man.gif",
    };
    const imgs: Record<string, HTMLImageElement> = {};
    for (const [key, src] of Object.entries(gifMap)) {
      const img = new Image();
      img.src = src;
      imgs[key] = img;
    }
    onelinerGifsRef.current = imgs;
  }, []);

  // Poll Nectarine oneliner chat via edge function
  useEffect(() => {
    const countryCodeToFlag = (code: string): string => {
      if (!code || code.length !== 2) return "";
      return code
        .toUpperCase()
        .split("")
        .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
        .join("");
    };

    const fetchOneliner = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("scenestream-proxy", {
          body: { endpoint: "/demovibes/xml/oneliner/" },
        });
        if (error) throw error;

        const text = typeof data === "string" ? data : JSON.stringify(data);
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");
        const entries = xml.querySelectorAll("entry");
        if (entries.length > 0) {
          const firstTime = entries[0].getAttribute("time") || "";
          if (firstTime !== lastOnelinerTimeRef.current) {
            lastOnelinerTimeRef.current = firstTime;
            const items: { author: string; message: string; flag: string }[] = [];
            const count = Math.min(entries.length, 5);
            for (let i = 0; i < count; i++) {
              const entry = entries[i];
              const authorEl = entry.querySelector("author");
              const author = authorEl?.textContent || "???";
              const flag = authorEl?.getAttribute("flag") || "";
              const message = entry.querySelector("message")?.textContent || "";
              items.push({ author, message, flag: countryCodeToFlag(flag) });
            }
            onelinerRef.current = items;
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
  const applyCoopNetStateRef = useRef<(net: CoopNetState) => void>(() => {});
  const sendStateRef = useRef<(state: DuelNetState) => void>(() => {});
  const sendCoopStateRef = useRef<(state: CoopNetState) => void>(() => {});
  useEffect(() => {
    applyNetStateRef.current = applyNetState;
  }, [applyNetState]);
  useEffect(() => {
    applyCoopNetStateRef.current = applyCoopNetState;
  }, [applyCoopNetState]);
  useEffect(() => {
    sendStateRef.current = multiplayer.sendState;
  }, [multiplayer.sendState]);
  useEffect(() => {
    sendCoopStateRef.current = multiplayer.sendCoopState;
  }, [multiplayer.sendCoopState]);
  useEffect(() => {
    isHostRef.current = multiplayer.isHost;
  }, [multiplayer.isHost]);
  useEffect(() => {
    isConnectedRef.current = multiplayer.isConnected;
  }, [multiplayer.isConnected]);

  // Guest (duel): register a direct callback so state is applied the instant it
  // arrives from the Supabase channel – no 16 ms setInterval polling delay.
  useEffect(() => {
    if (gameMode !== "online" || multiplayer.isHost) {
      multiplayer.onRemoteStateRef.current = null;
      return;
    }
    multiplayer.onRemoteStateRef.current = (state: DuelNetState) => {
      applyNetStateRef.current(state);
    };
    return () => {
      multiplayer.onRemoteStateRef.current = null;
    };
  }, [gameMode, multiplayer.isHost]);

  // Guest (coop): same zero-polling path for co-op state
  useEffect(() => {
    if (gameMode !== "online_coop" || multiplayer.isHost) {
      multiplayer.onRemoteCoopStateRef.current = null;
      return;
    }
    multiplayer.onRemoteCoopStateRef.current = (state: CoopNetState) => {
      applyCoopNetStateRef.current(state);
    };
    return () => {
      multiplayer.onRemoteCoopStateRef.current = null;
    };
  }, [gameMode, multiplayer.isHost]);

  // Guest: listen for game_start and start the appropriate mode
  useEffect(() => {
    multiplayer.onGameStartRef.current = (mode: SessionMode, playerCount?: number) => {
      if (mode === "coop") {
        initOnlineCoop(false, playerCount ?? 2);
      } else {
        initOnline(false);
      }
    };
  }, [initOnline, initOnlineCoop]);

  // Guest: listen for game_restart from host and show the READY button + countdown
  useEffect(() => {
    multiplayer.onGameRestartRef.current = (playerCount?: number, deadline?: number) => {
      // Use gameModeRef (not gameMode state) to get the current value inside the callback closure.
      // Also accept restarts when still in "online_lobby" for late-joining spectators who are
      // transitioning — they haven't switched to "online_coop" yet but must capture the event.
      const isEligible =
        gameModeRef.current === "online_coop" ||
        (gameModeRef.current === "online_lobby" && !isHostRef.current);
      if (isEligible) {
        if (playerCount != null) {
          setCoopPlayerCount(playerCount);
        }
        setHostRestarted(true);
        // Start countdown from the shared deadline
        if (deadline != null) {
          restartDeadlineRef.current = deadline;
          const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          setRestartCountdown(remaining);
          setCountdownKey((k) => k + 1);
        }
      }
    };
  }, [multiplayer.onGameRestartRef]);

  // Countdown timer effect — uses setInterval (keyed by countdownKey) to tick every 500 ms.
  // The previous setTimeout-chain approach broke because when the displayed value didn't
  // change on the first tick (e.g. still 20), React bailed out and no new timeout was set.
  useEffect(() => {
    if (restartDeadlineRef.current == null) return;

    const interval = setInterval(() => {
      const deadline = restartDeadlineRef.current;
      if (deadline == null) {
        clearInterval(interval);
        setRestartCountdown(null);
        return;
      }
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRestartCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        restartDeadlineRef.current = null;
        if (gameModeRef.current === "online_coop") {
          if (isHostRef.current) {
            // Host auto-starts the game when countdown expires.
            // Use expectedGuestsForRestartRef + 1 so the count stays accurate
            // if guests left mid-countdown (the ref is kept in sync by onPlayerLeaveRef).
            const pc = expectedGuestsForRestartRef.current + 1;
            expectedGuestsForRestartRef.current = 0; // disarm ready tracking
            initCoopRef.current(true, pc);
          } else if (hostRestartedRef.current) {
            // Guest who hasn't pressed READY — auto-start them
            setHostRestarted(false);
            setIsSpectating(false);
            initOnlineCoopRef.current(false, coopPlayerCountRef.current);
          }
        }
        setRestartCountdown(null);
      }
    }, 500);

    return () => clearInterval(interval);
    // countdownKey changes each time a new countdown session starts; that is the
    // only dependency needed — the interval reads all other values via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownKey]);

  // Host: listen for player_ready signals from guests during a countdown restart.
  // When all expected guests have pressed READY, cancel the countdown and start immediately.
  useEffect(() => {
    multiplayer.onPlayerReadyRef.current = (playerIdx: number) => {
      if (!isHostRef.current || gameModeRef.current !== "online_coop") return;
      // Guard: ignore late player_ready broadcasts after a restart has already started
      // (expectedGuestsForRestartRef is zeroed when initCoop fires).
      if (expectedGuestsForRestartRef.current === 0) return;
      readyPlayerIdxsRef.current.add(playerIdx);
      if (readyPlayerIdxsRef.current.size >= expectedGuestsForRestartRef.current) {
        // All guests are ready — cancel the countdown and start immediately.
        // Use expectedGuestsForRestartRef + 1 (host) for the authoritative player count.
        const pc = expectedGuestsForRestartRef.current + 1;
        expectedGuestsForRestartRef.current = 0; // disarm so further broadcasts are ignored
        restartDeadlineRef.current = null;
        setRestartCountdown(null);
        initCoopRef.current(true, pc);
      }
    };
  }, [multiplayer.onPlayerReadyRef]);

  // Host: when a guest leaves, adjust expected ready count and check if we can start early.
  useEffect(() => {
    multiplayer.onPlayerLeaveRef.current = (playerIdx: number) => {
      if (!isHostRef.current || gameModeRef.current !== "online_coop") return;
      // Remove from ready set (if they had already pressed ready)
      readyPlayerIdxsRef.current.delete(playerIdx);
      // Decrease expected player count
      if (expectedGuestsForRestartRef.current > 0) {
        expectedGuestsForRestartRef.current -= 1;
      }
      // If no guests remain and a countdown was running, cancel it (host waits for players)
      if (expectedGuestsForRestartRef.current === 0 && restartDeadlineRef.current != null) {
        restartDeadlineRef.current = null;
        setRestartCountdown(null);
      } else if (
        expectedGuestsForRestartRef.current > 0 &&
        readyPlayerIdxsRef.current.size >= expectedGuestsForRestartRef.current &&
        restartDeadlineRef.current != null
      ) {
        // All remaining guests are ready — start immediately with updated count.
        const pc = expectedGuestsForRestartRef.current + 1;
        expectedGuestsForRestartRef.current = 0; // disarm so further broadcasts are ignored
        restartDeadlineRef.current = null;
        setRestartCountdown(null);
        initCoopRef.current(true, pc);
      }
    };
  }, [multiplayer.onPlayerLeaveRef]);

  // Host: when a new guest joins during an active restart countdown, re-broadcast game_restart
  // so the new joiner receives the restart state they would otherwise have missed.
  useEffect(() => {
    multiplayer.onGuestJoinedRef.current = () => {
      if (!isHostRef.current || restartDeadlineRef.current == null) return;
      // Re-broadcast the restart so the late-joining guest receives it. Use
      // expectedGuestsForRestartRef which was already set correctly by the RESTART
      // button handler (it accounts for mid-game spectator promotions via lastCoopPlayerCountRef).
      multiplayer.sendGameRestart(restartDeadlineRef.current, expectedGuestsForRestartRef.current + 1);
    };
  }, [multiplayer.onGuestJoinedRef, multiplayer.sendGameRestart]);

  // Guest/late-joiner: listen for players_added to enter an in-progress game
  useEffect(() => {
    multiplayer.onPlayersAddedRef.current = (newPlayerCount: number) => {
      if (gameModeRef.current === "online_lobby" || gameModeRef.current === "online_coop") {
        // Late joiner from lobby, or spectator already in online_coop who needs a fresh init
        // with the authoritative player count broadcast by the host.
        initOnlineCoop(false, newPlayerCount);
      }
      // Existing online_coop guests don't need to re-init; applyCoopNetState handles the
      // expanded player count automatically as new state arrives from the host.
    };
  }, [initOnlineCoop]);

  // Guest late-joiner: when gameInProgress is detected in the lobby, transition to
  // spectator mode so they can see the ongoing game and receive restart events.
  const spectatorInitedRef = useRef(false);
  useEffect(() => {
    if (
      gameMode === "online_lobby" &&
      !multiplayer.isHost &&
      multiplayer.gameInProgress &&
      !spectatorInitedRef.current
    ) {
      spectatorInitedRef.current = true;
      setIsSpectating(true);
      // Transition from lobby into the game view as a spectator.
      // Use guestCount+1 as a reasonable playerCount estimate; the host's
      // coop_state broadcasts will supply the authoritative state.
      const estimatedPlayerCount = multiplayer.guestCount + 1;
      initOnlineCoop(false, estimatedPlayerCount);
      // Immediately register the coop state callback to eliminate the race condition
      // where coop_state broadcasts arrive before the gameMode-dependent effect re-runs.
      multiplayer.onRemoteCoopStateRef.current = (state: CoopNetState) => {
        applyCoopNetStateRef.current(state);
      };
    }
    // Reset the guard when leaving the lobby
    if (gameMode !== "online_lobby") {
      spectatorInitedRef.current = false;
    }
  }, [gameMode, multiplayer.isHost, multiplayer.gameInProgress, multiplayer.guestCount, initOnlineCoop]);

  // When the host disconnects while a guest is still in the lobby (including late
  // joiners stuck in the "Joining" phase), immediately disconnect and return to menu.
  useEffect(() => {
    if (multiplayer.hostDisconnected && !multiplayer.isHost && gameModeRef.current === "online_lobby") {
      multiplayer.disconnect();
      setGameMode("menu");
    }
  }, [multiplayer.hostDisconnected, multiplayer.isHost]);

  // Host (duel): worker message handler – broadcast every tick for minimum lag
  useEffect(() => {
    if (gameMode !== "online" || !multiplayer.isHost) return;
    const worker = workerRef.current;
    if (!worker) return;
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === "state") {
        const net: DuelNetState = e.data.data;
        applyNetStateRef.current(net);
        // Broadcast every tick – previously throttled to every 3rd tick which added
        // up to 50 ms of additional guest lag on top of network RTT.
        sendStateRef.current(net);
      }
    };
  }, [gameMode, multiplayer.isHost]);

  // Host (coop online): co-op worker message handler
  const addingWaitingPlayersRef = useRef(false);
  useEffect(() => {
    if (gameMode !== "online_coop" || !multiplayer.isHost) return;
    const worker = workerRef.current;
    if (!worker) return;
    // Reset guard and tick counter whenever the effect re-runs (new game)
    addingWaitingPlayersRef.current = false;
    // Reset tick counter so throttling starts fresh for each new game
    netBroadcastTickRef.current = 0;
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === "state") {
        const net: CoopNetState = e.data.data;
        // When game is over, check if any "waiting" players (joined after game start) exist
        if (net.gameOver && !addingWaitingPlayersRef.current) {
          const waitingCount = multiplayer.getWaitingPlayerCount(net.playerCount);
          if (waitingCount > 0) {
            addingWaitingPlayersRef.current = true;
            const newPlayerCount = net.playerCount + waitingCount;
            // Expand the worker to include the waiting players
            worker.postMessage({ type: "add_players", count: waitingCount });
            // Notify late joiners so they transition from lobby to game
            multiplayer.sendPlayersAdded(newPlayerCount);
            return; // Skip applying this game-over state frame
          }
        }
        // Reset guard once the worker is no longer in game-over state
        if (!net.gameOver && addingWaitingPlayersRef.current) {
          addingWaitingPlayersRef.current = false;
        }
        // Track the authoritative player count so the RESTART handler can use it
        lastCoopPlayerCountRef.current = net.playerCount;
        applyCoopNetStateRef.current(net);
        // Throttle network broadcast to ~20 Hz (every 3rd tick at 60 Hz)
        netBroadcastTickRef.current++;
        if (netBroadcastTickRef.current % ONLINE_STATE_BROADCAST_TICK_INTERVAL === 0) {
          sendCoopStateRef.current(net);
        }
      }
    };
  }, [gameMode, multiplayer.isHost, multiplayer.getWaitingPlayerCount, multiplayer.sendPlayersAdded, coopGeneration]);

  // Local coop: worker → coopStateRef
  useEffect(() => {
    if (gameMode !== "coop") return;
    const worker = workerRef.current;
    if (!worker) return;
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === "state") {
        applyCoopNetStateRef.current(e.data.data as CoopNetState);
      }
    };
  }, [gameMode, coopGeneration]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "stop" });
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // TAB key toggles the in-game chat panel during online modes
  useEffect(() => {
    if (gameMode !== "online_coop" && gameMode !== "online") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        setIsChatOpen((open) => {
          if (open) {
            canvasRef.current?.focus();
          }
          return !open;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameMode]);

  // Keep the game-over selection ref in sync with state (for side-effect-free reads)
  useEffect(() => {
    gameOverSelectionRef.current = gameOverSelection;
  }, [gameOverSelection]);

  // Global Enter/Space hotkeys for game-over overlay (local modes, not when initials input focused)
  useEffect(() => {
    if (!showGameOver) return;
    if (gameMode === "online" || gameMode === "online_coop") return;
    const handleGameOverKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      // Do not intercept if the initials text input has focus
      if (document.activeElement instanceof HTMLInputElement) return;
      e.preventDefault();
      if (gameOverSelectionRef.current === 0) {
        initGame();
      } else {
        gameStateRef.current = null;
        duelStateRef.current = null;
        setGameMode("menu");
        setShowGameOver(false);
        setShowLifeLost(false);
        showLifeLostRef.current = false;
        soundEffects.stopThrust();
      }
    };
    window.addEventListener("keydown", handleGameOverKey);
    return () => window.removeEventListener("keydown", handleGameOverKey);
  }, [showGameOver, gameMode, initGame]);

  const continueAfterLifeLost = useCallback(() => {
    showLifeLostRef.current = false;
    setShowLifeLost(false);
  }, []);

  const quitToMenu = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "stop" });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    const m = gameModeRef.current;
    if (m === "online" || m === "online_lobby" || m === "online_coop") {
      multiplayer.disconnect();
    }
    gameStateRef.current = null;
    duelStateRef.current = null;
    coopStateRef.current = null;
    guestPredictedShipRef.current = null;
    stopHeartbeatInterval();
    setGameMode("menu");
    setShowGameOver(false);
    setShowLifeLost(false);
    showLifeLostRef.current = false;
    setCoopGameOver(false);
    setCoopWaveComplete(false);
    setCoopPlayerStats([]);
    setHostRestarted(false);
    restartDeadlineRef.current = null;
    setRestartCountdown(null);
    readyPlayerIdxsRef.current = new Set();
    expectedGuestsForRestartRef.current = 0;
    lastCoopPlayerCountRef.current = 0;
    setIsSpectating(false);
    isPausedRef.current = false;
    setIsPaused(false);
    soundEffects.stopThrust();
    prevCoopThrustRef.current = false;
    prevCoopFireRef.current = false;
    prevCoopHyperspaceRef.current = false;
    // Release canvas focus
    canvasRef.current?.blur();
  }, [multiplayer]);

  const togglePause = useCallback(() => {
    isPausedRef.current = !isPausedRef.current;
    setIsPaused(isPausedRef.current);
    setPauseSelection(0);
    if (isPausedRef.current) {
      soundEffects.stopThrust();
      prevCoopThrustRef.current = false;
      prevCoopFireRef.current = false;
      prevCoopHyperspaceRef.current = false;
    } else {
      void sendHeartbeat();
    }
  }, [sendHeartbeat]);

  const resumeGame = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    void sendHeartbeat();
  }, [sendHeartbeat]);

  const handleCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      // Do not intercept game controls while the initials input has focus
      if (document.activeElement instanceof HTMLInputElement) return;

      // Debug panel toggle with § key
      if (DEBUG_ENABLED && (e.key === "§" || e.key === "Dead")) {
        e.preventDefault();
        setShowDebugPanel((prev) => !prev);
        return;
      }

      // Level skip with 0 key (solo only, debug only)
      if (
        DEBUG_ENABLED &&
        e.key === "0" &&
        gameModeRef.current === "solo" &&
        !isPausedRef.current &&
        !showLifeLostRef.current
      ) {
        e.preventDefault();
        addDebugLog("wave", "Level skip triggered (cheat)");
        nextWave();
        return;
      }

      // Add 100k points with X key (solo only, debug only)
      if (
        DEBUG_ENABLED &&
        (e.key === "x" || e.key === "X") &&
        gameModeRef.current === "solo" &&
        gameStateRef.current &&
        !gameStateRef.current.gameOver &&
        !isPausedRef.current
      ) {
        e.preventDefault();
        gameStateRef.current.score += 100000;
        setDisplayScore(gameStateRef.current.score);
        addDebugLog("wave", `+100,000 points cheat (now ${gameStateRef.current.score})`);
        return;
      }

      // Pause toggle on Escape
      if (e.key === "Escape" && (gameModeRef.current === "solo" || isMultiplayerMode(gameModeRef.current))) {
        if (!showLifeLostRef.current && !showGameOver) {
          e.preventDefault();
          togglePause();
          return;
        }
      }

      // When paused, handle pause menu navigation
      if (isPausedRef.current) {
        if (
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "w" ||
          e.key === "W" ||
          e.key === "s" ||
          e.key === "S"
        ) {
          e.preventDefault();
          setPauseSelection((s) => {
            if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") return (s - 1 + 3) % 3;
            return (s + 1) % 3;
          });
        }
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setPauseSelection((s) => {
            if (s === 0) resumeGame();
            else if (s === 1) {
              setShowSettings(true);
            } else {
              resumeGame();
              quitToMenu();
            }
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

      // Prevent default browser behavior for game control keys during gameplay
      const b = controlBindingsRef.current;
      const allGameKeys = new Set([
        b.p1.left,
        b.p1.right,
        b.p1.thrust,
        b.p1.fire,
        b.p1.hyperspace,
        b.p2.left,
        b.p2.right,
        b.p2.thrust,
        b.p2.fire,
        b.p2.hyperspace,
        b.p2.left.toUpperCase(),
        b.p2.right.toUpperCase(),
        b.p2.thrust.toUpperCase(),
        b.p2.fire.toUpperCase(),
        b.p2.hyperspace.toUpperCase(),
        "ArrowDown", // always prevent
      ]);
      if (!showGameOver && allGameKeys.has(e.key)) {
        e.preventDefault();
      }

      keysRef.current[e.key] = true;
      if (gameModeRef.current === "solo") {
        if (e.key === b.p1.fire) {
          e.preventDefault();
          shootBullet();
        }
        if (e.key === b.p1.hyperspace || e.key === "h" || e.key === "H") {
          e.preventDefault();
          hyperspace();
        }
      } else if (isMultiplayerMode(gameModeRef.current)) {
        if (e.key === b.p1.fire) {
          e.preventDefault();
        }
        if (e.key === b.p2.fire || e.key === b.p2.fire.toUpperCase()) {
          e.preventDefault();
        }
      }
    },
    [shootBullet, hyperspace, togglePause, resumeGame, quitToMenu, showGameOver, addDebugLog, nextWave],
  );

  const handleCanvasKeyUp = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    keysRef.current[e.key] = false;
  }, []);

  // Start game loop
  useEffect(() => {
    // Reset timing state so the first frame doesn't produce a huge delta
    lastTimeRef.current = performance.now();
    lastFrameTimeRef.current = 0;
    accumulatorRef.current = 0;
    animationFrameRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      stopHeartbeatInterval();
    };
  }, [gameLoop]);

  // Blur / visibility handling: clear held keys, stop thrust audio, auto-pause local modes
  useEffect(() => {
    const handleBlurOrHide = () => {
      keysRef.current = {};
      soundEffects.stopThrust();
      prevCoopThrustRef.current = false;
      prevCoopFireRef.current = false;
      prevCoopHyperspaceRef.current = false;
      const m = gameModeRef.current;
      if (m === "solo" || m === "duel" || m === "coop") {
        isPausedRef.current = true;
        setIsPaused(true);
      }
    };
    const handleVisibility = () => {
      if (document.hidden) {
        handleBlurOrHide();
      } else {
        soundEffects.resumeIfSuspended();
      }
    };
    window.addEventListener("blur", handleBlurOrHide);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", handleBlurOrHide);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (gameMode !== "menu" || showFullLeaderboard || showOldLeaderboard || showChangelog || showSettings) return;
    const handleMenuKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.key === "Enter" && target?.closest('button, a, input, [role="tab"]')) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        setMenuSelection((selection) => {
          if (event.key === "ArrowUp") {
            if (selection === 4) return 3;
            if (selection === 3) return canUseKeyboard ? 1 : 0;
            return 0;
          }
          if (selection === 0) return canUseKeyboard ? 1 : 3;
          if (selection === 1) return 3;
          if (selection === 3) return 4;
          return 0;
        });
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (menuSelection === 0) initGame();
        else if (menuSelection === 1 && canUseKeyboard) initDuel();
        else if (menuSelection === 3) setGameMode("online_lobby");
        else if (menuSelection === 4) setShowSettings(true);
      }
    };
    window.addEventListener("keydown", handleMenuKey);
    return () => window.removeEventListener("keydown", handleMenuKey);
  }, [gameMode, showFullLeaderboard, showOldLeaderboard, showChangelog, showSettings, menuSelection, canUseKeyboard, initGame, initDuel]);

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
          if (
            justStart &&
            (gameModeRef.current === "solo" || isMultiplayerMode(gameModeRef.current)) &&
            !showLifeLostRef.current &&
            !showGameOver
          ) {
            togglePause();
          }

          // When paused, handle pause menu
          if (isPausedRef.current) {
            if (justUp || justDown) {
              setPauseSelection((s) => {
                if (justUp) return (s - 1 + 3) % 3;
                return (s + 1) % 3;
              });
            }
            if (justA) {
              setPauseSelection((s) => {
                if (s === 0) resumeGame();
                else if (s === 1) {
                  setShowSettings(true);
                } else {
                  resumeGame();
                  quitToMenu();
                }
                return s;
              });
            }
          } else if (gameModeRef.current === "menu") {
            if (justUp) {
              setMenuSelection((s) => (!canUseKeyboard && (s === 2 || s === 3) ? 0 : s === 4 ? 3 : s === 3 ? (canUseKeyboard ? 1 : 0) : 0));
            }
            if (justDown) {
              setMenuSelection((s) => (s === 0 ? (canUseKeyboard ? 1 : 3) : s === 1 ? 3 : s === 3 ? 4 : 0));
            }
            if (justA) {
              setMenuSelection((s) => {
                if (s === 0) initGame();
                else if (s === 1) initDuel();
                else if (s === 2) initCoop();
                else if (s === 3) setGameMode("online_lobby");
                else setShowSettings(true);
                return s;
              });
            }
          } else if (showLifeLostRef.current) {
            if (justA) {
              showLifeLostRef.current = false;
              setShowLifeLost(false);
            }
          } else if (showGameOver) {
            if (justUp || justDown) {
              const next = gameOverSelectionRef.current === 0 ? 1 : 0;
              gameOverSelectionRef.current = next;
              setGameOverSelection(next);
            }
            if (justA) {
              if (gameOverSelectionRef.current === 0) {
                initGame();
              } else {
                gameStateRef.current = null;
                duelStateRef.current = null;
                setGameMode("menu");
                setShowGameOver(false);
                setShowLifeLost(false);
                showLifeLostRef.current = false;
                soundEffects.stopThrust();
              }
            }
          } else if (isMultiplayerMode(gameModeRef.current)) {
            if (justB) {
              quitToMenu();
            }
          }
        }
      } catch {
        /* no gamepad */
      }
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [initGame, initDuel, initCoop, showGameOver, togglePause, resumeGame, quitToMenu, canUseKeyboard]);

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
          onBack={() => {
            multiplayer.disconnect();
            setGameMode("menu");
          }}
          onInitialsSet={(inits) => multiplayer.setLocalInitials(inits)}
          onStartGame={(mode, playerCount) => {
            const pc = playerCount ?? multiplayer.guestCount + 1;
            multiplayer.startGame(mode, pc);
            if (mode === "coop") {
              multiplayer.setGameInProgress(true);
              initOnlineCoop(true, pc);
            } else {
              initOnline(true);
            }
          }}
          roomCode={multiplayer.roomCode}
          isHost={multiplayer.isHost}
          isConnected={multiplayer.isConnected}
          opponentConnected={multiplayer.opponentConnected}
          guestCount={multiplayer.guestCount}
          chatMessages={multiplayer.chatMessages}
          onSendChatMessage={(text) => multiplayer.sendChatMessage(text)}
          gameInProgress={multiplayer.gameInProgress}
        />
      </div>
    );
  }

  // ===== MENU SCREEN =====
  if (gameMode === "menu") {
    const activeScores = scoreTab === "global" ? leaderboard : localHighScores;
    const scoreRows = leaderboardLoading && scoreTab === "global" ? null : activeScores.slice(0, 3);
    return (
      <div className="relative min-h-dvh w-full overflow-x-hidden bg-[hsl(var(--game-background))] flex flex-col items-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)]" />
        <svg aria-hidden="true" className="pointer-events-none fixed left-3 top-8 z-0 h-20 w-20 text-[hsl(var(--game-foreground))] opacity-10" viewBox="0 0 100 100">
          <polygon points="11,42 25,15 56,7 87,28 92,61 69,89 32,85 7,63" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <polygon points="28,35 43,27 53,39 41,48" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <svg aria-hidden="true" className="pointer-events-none fixed bottom-10 right-2 z-0 h-28 w-28 text-[hsl(var(--game-foreground))] opacity-[0.12]" viewBox="0 0 100 100">
          <polygon points="8,35 26,9 60,13 91,39 82,75 54,93 20,80" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <polygon points="51,25 70,34 66,50 48,47" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>

        <div className="relative z-10 my-auto flex w-full max-w-[360px] flex-col items-stretch gap-6">
          <header className="text-center">
            <div
              className="font-mono text-3xl tracking-widest text-[hsl(var(--game-foreground))] sm:text-4xl md:text-6xl"
              style={{ textShadow: "0 0 30px hsl(var(--game-foreground))" }}
            >
              ASTEROIDS
            </div>
            <div className="mt-2 font-mono text-xs tracking-[0.3em] text-[hsl(var(--game-foreground))] opacity-70">
              DEMOSCENE EDITION
            </div>
          </header>

          <div className="flex flex-col items-stretch gap-3">
            <MenuButton label="SOLO" onClick={initGame} variant="primary" selected={menuSelection === 0} />
            {canUseKeyboard && (
              <MenuButton label="DUEL" onClick={initDuel} variant="secondary" accent="orange" selected={menuSelection === 1} subLabel="2P LOCAL" />
            )}
            <MenuButton label="ONLINE" onClick={() => setGameMode("online_lobby")} variant="secondary" accent="green" selected={menuSelection === 3} badge="ALPHA" ariaLabel="Online alpha" />
            <MenuButton label="SETTINGS" onClick={() => setShowSettings(true)} variant="ghost" selected={menuSelection === 4} />
          </div>

          <section className="w-full" aria-label="High scores">
            <div className="overflow-hidden rounded-md border border-[hsl(var(--game-foreground))]/30 bg-[hsl(var(--game-background))]/70">
              <div role="tablist" aria-label="Score source" className="grid grid-cols-2 border-b border-[hsl(var(--game-foreground))]/30">
                {(["global", "local"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={scoreTab === tab}
                    onClick={() => setScoreTab(tab)}
                    className={`h-11 font-mono text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${scoreTab === tab ? "bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))]" : "text-[hsl(var(--game-foreground))] opacity-80"}`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="flex h-[84px] flex-col justify-center px-4 font-mono text-sm" role="tabpanel">
                {scoreRows === null ? (
                  [0, 1, 2].map((row) => <div key={row} className="flex h-7 items-center justify-between text-[hsl(var(--game-foreground))] opacity-70"><span>···</span><span>········</span></div>)
                ) : scoreRows.length === 0 ? (
                  <div className="text-center text-[10px] text-[hsl(var(--game-foreground))] opacity-80">NO SCORES YET — PLAY A GAME!</div>
                ) : (
                  scoreRows.map((entry, index) => (
                    <div key={`${entry.initials}-${entry.score}-${index}`} className={`flex h-7 items-center justify-between ${index === 0 ? "text-[#FFD700]" : index === 1 ? "text-[#C0C0C0]" : "text-[#CD7F32]"}`}>
                      <span className="whitespace-pre">{(index + 1).toString().padStart(2, " ")}. {entry.initials.padEnd(3, " ")}</span>
                      <span>{entry.score.toString().padStart(8, "0")}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowFullLeaderboard(true)} className="h-11 font-mono text-[10px] text-[hsl(var(--game-foreground))] opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">ALL SCORES ▸</button>
              {HIGH_SCORES_ENABLED && (
                <button type="button" onClick={() => { loadOldLeaderboard().then(setOldLeaderboard); setShowOldLeaderboard(true); }} className="h-11 font-mono text-[10px] text-[hsl(var(--game-foreground))] opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">OLD HIGHSCORES ▸</button>
              )}
            </div>
          </section>

          <div className="max-w-full space-y-1 text-center font-mono text-[10px] text-[hsl(var(--game-foreground))] opacity-80">
            {!canUseKeyboard ? (
              <>
                <div>TOUCH: ◀ ▶ TURN · ▲ THRUST · ◎ FIRE</div>
                <div>ONLINE: CREATE OR JOIN A ROOM</div>
              </>
            ) : (
              <>
                <div className="whitespace-normal">SOLO: {displayKeyName(controlBindingsRef.current.p1.left)}{displayKeyName(controlBindingsRef.current.p1.right)}{displayKeyName(controlBindingsRef.current.p1.thrust)} + {displayKeyName(controlBindingsRef.current.p1.fire)} + {displayKeyName(controlBindingsRef.current.p1.hyperspace)} | GAMEPAD</div>
                <div className="whitespace-normal">DUEL: P1 {displayKeyName(controlBindingsRef.current.p1.left)}{displayKeyName(controlBindingsRef.current.p1.right)}{displayKeyName(controlBindingsRef.current.p1.thrust)}+{displayKeyName(controlBindingsRef.current.p1.fire)} | P2 {displayKeyName(controlBindingsRef.current.p2.left)}{displayKeyName(controlBindingsRef.current.p2.right)}{displayKeyName(controlBindingsRef.current.p2.thrust)}+{displayKeyName(controlBindingsRef.current.p2.fire)}</div>
                <div className="whitespace-normal">ONLINE: CREATE OR JOIN A ROOM</div>
              </>
            )}
          </div>

          <div>
            <RadioMiniPlayer
              audioRef={audioRef}
              isPlaying={isRadioPlaying}
              nowPlaying={nowPlaying}
              autoPlayMusic={autoPlayMusic}
              onToggleAutoPlay={() => setAutoPlayMusic((enabled) => !enabled)}
            />
            {DEBUG_ENABLED && (
              <label className="mt-1 flex h-5 items-center justify-center gap-2 font-mono text-[10px] text-[hsl(var(--game-danger))] opacity-70">
                <input type="checkbox" checked={trainerMode} onChange={(event) => setTrainerMode(event.target.checked)} className="accent-[hsl(var(--game-danger))]" />
                TRAINER (NO SCORES)
              </label>
            )}
          </div>

          <footer className="flex items-center justify-center gap-4">
            <button type="button" onClick={() => setShowChangelog(true)} className="inline-flex min-h-11 min-w-11 items-center justify-center font-mono text-[10px] text-[hsl(var(--game-foreground))] opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">📋 CHANGELOG</button>
            <a href="https://buymeacoffee.com/qumran" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center justify-center opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" title="Buy me a coffee">
              <img src={bmcIcon} alt="Buy me a coffee" className="h-6 w-6" />
            </a>
          </footer>
        </div>

        {showFullLeaderboard && (
          <div role="dialog" aria-modal="true" aria-label={scoreTab === "local" ? "Local high scores" : "Global high scores"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setShowFullLeaderboard(false)}>
            <div className="max-h-[80dvh] w-full max-w-sm overflow-auto border-2 border-[hsl(var(--game-foreground))]/40 bg-[hsl(var(--game-background))] p-4" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 text-center font-mono text-lg tracking-wider text-[hsl(var(--game-glow))]">★ {scoreTab === "local" ? "LOCAL HIGH SCORES" : "HIGH SCORES"} ★</div>
              {activeScores.length === 0 ? <div className="text-center font-mono text-sm text-[hsl(var(--game-foreground))] opacity-70">No scores yet</div> : activeScores.map((entry, index) => <div key={`${entry.initials}-${entry.score}-${index}`} className="flex justify-between py-0.5 font-mono text-sm text-[hsl(var(--game-foreground))]"><span className="whitespace-pre">{(index + 1).toString().padStart(2, " ")}. {entry.initials.padEnd(3, " ")}</span><span>{entry.score.toString().padStart(8, "0")}</span></div>)}
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setShowFullLeaderboard(false)} className="min-h-11 flex-1 border border-[hsl(var(--game-foreground))]/30 font-mono text-xs text-[hsl(var(--game-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">CLOSE</button>
                {scoreTab === "local" && localHighScores.length > 0 && <button type="button" onClick={() => { localStorage.removeItem(LOCAL_SCORES_KEY); setLocalHighScores([]); }} className="min-h-11 flex-1 border border-[hsl(var(--game-danger))]/30 font-mono text-xs text-[hsl(var(--game-danger))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">CLEAR SCORES</button>}
              </div>
            </div>
          </div>
        )}

        {HIGH_SCORES_ENABLED && showOldLeaderboard && (
          <div role="dialog" aria-modal="true" aria-label="Old high scores" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setShowOldLeaderboard(false)}>
            <div className="max-h-[80dvh] w-full max-w-sm overflow-auto border-2 border-[hsl(var(--game-foreground))]/40 bg-[hsl(var(--game-background))] p-4" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 text-center font-mono text-lg tracking-wider text-[#FFD700]">★ OLD HIGHSCORES ★</div>
              {oldLeaderboard.map((entry, index) => <div key={`${entry.initials}-${entry.score}-${index}`} className="flex justify-between py-0.5 font-mono text-sm text-[hsl(var(--game-foreground))]"><span className="whitespace-pre">{(index + 1).toString().padStart(2, " ")}. {entry.initials.padEnd(3, " ")}</span><span>{entry.score.toString().padStart(8, "0")}</span></div>)}
              <button type="button" onClick={() => setShowOldLeaderboard(false)} className="mt-4 min-h-11 w-full border border-[hsl(var(--game-foreground))]/30 font-mono text-xs text-[hsl(var(--game-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">CLOSE</button>
            </div>
          </div>
        )}

        {/* Settings overlay */}
        {showSettings && (
          <ControlSettings
            bindings={controlBindingsRef.current}
            onSave={(newBindings) => {
              controlBindingsRef.current = newBindings;
              if (gameStateRef.current) gameStateRef.current.ship.rotationSpeed = newBindings.turnSpeed;
              setShowSettings(false);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Changelog overlay */}
        {showChangelog && (
          <ChangelogOverlay currentVersion={GAME_VERSION} onClose={() => setShowChangelog(false)} />
        )}

      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[hsl(var(--game-background))] flex flex-col items-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:justify-center">
      {/* HUD */}
      {gameMode === "solo" && (
        <div
          className="mb-2 sm:mb-4 h-8 shrink-0 overflow-hidden whitespace-nowrap flex flex-nowrap gap-2 sm:gap-8 items-center text-[hsl(var(--game-foreground))] text-[8px] sm:text-xs tracking-wide justify-center"
          style={{ fontFamily: "'Press Start 2P', monospace", textShadow: "0 0 10px hsl(var(--game-foreground))" }}
        >
          <span>SCORE: {displayScore.toString().padStart(8, "0")}</span>
          <span>
            LIVES: {displayLives}{" "}
            <span className="pointer-events-none opacity-60 text-[7px] sm:text-[9px] hidden md:inline">
              NEXT 1UP: {Math.max(0, extraLifeThreshold((gameStateRef.current?.extraLifeCount ?? 0) + 1) - displayScore).toLocaleString()}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <span>WAVE: {displayWave}</span>
            <span className="text-[#888888] text-[7px] hidden md:inline" style={{ textShadow: "none" }}>
              v{GAME_VERSION}
            </span>
          </div>
          {/* Hyperspace charge indicator */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <svg className="absolute inset-0 w-8 h-8 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="hsl(var(--game-foreground))"
                strokeWidth="2"
                opacity="0.2"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke={hyperChargePercent >= 100 ? "#CC66FF" : "#666666"}
                strokeWidth="2.5"
                strokeDasharray={`${(hyperChargePercent / 100) * 94.25} 94.25`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.1s linear" }}
              />
            </svg>
            <img
              src={hyperspaceIcon}
              alt="Hyperspace"
              className={`w-5 h-5 relative z-10 ${hyperChargePercent >= 100 ? "animate-pulse" : ""}`}
              style={{
                filter: hyperChargePercent >= 100 ? "none" : "grayscale(1) opacity(0.4)",
                transition: "filter 0.3s ease",
              }}
            />
          </div>
          {DEBUG_ENABLED && trainerMode && <div className="text-[#FF4444] animate-pulse">TRAINER</div>}
        </div>
      )}
      {(gameMode === "duel" || gameMode === "online") && (
        <div
          className="mb-2 sm:mb-4 flex flex-wrap gap-2 sm:gap-6 text-[8px] sm:text-xs tracking-wide justify-center"
          style={{ fontFamily: "'Press Start 2P', monospace" }}
        >
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
      {(gameMode === "coop" || gameMode === "online_coop") && (
        <div
          className="mb-2 sm:mb-4 flex flex-wrap gap-2 sm:gap-6 text-[8px] sm:text-xs tracking-wide justify-center"
          style={{ fontFamily: "'Press Start 2P', monospace" }}
        >
          <div style={{ color: "#44FF88", textShadow: "0 0 10px #44FF88" }}>WAVE {coopWave}</div>
          <div className="text-[hsl(var(--game-foreground))] opacity-30">|</div>
          <div style={{ color: "#FFFF00", textShadow: "0 0 10px #FFFF00" }}>SCORE: {coopScore}</div>
          <div className="text-[hsl(var(--game-foreground))] opacity-30">|</div>
          {Array.from({ length: coopPlayerCount }, (_, i) => {
            const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
            const isMe =
              gameMode === "online_coop" && (multiplayer.isHost ? i === 0 : i === multiplayer.playerIdxRef.current);
            const eliminated = coopEliminated[i];
            const label =
              gameMode === "online_coop" ? (multiplayer.playerInitialsMap.get(i) ?? `P${i + 1}`) : `P${i + 1}`;
            return (
              <div key={i} style={{ color, textShadow: `0 0 10px ${color}`, opacity: eliminated ? 0.4 : 1 }}>
                {label}
                {isMe ? " (YOU)" : ""} {eliminated ? "💀" : `❤${coopLives[i] ?? 0}`}
              </div>
            );
          })}
          {gameMode === "online_coop" && multiplayer.roomCode && (
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
          tabIndex={0}
          onKeyDown={handleCanvasKeyDown}
          onKeyUp={handleCanvasKeyUp}
          className="border-2 border-[hsl(var(--game-foreground))] shadow-[0_0_30px_hsl(var(--game-foreground))] max-w-full outline-none"
          style={{ touchAction: "none" }}
        />

        {showLifeLost && !showGameOver && gameMode === "solo" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
            <div className="text-2xl sm:text-4xl font-mono text-[hsl(var(--game-danger))] mb-4 sm:mb-6 animate-pulse">
              LIFE LOST!
            </div>
            <Button
              onClick={continueAfterLifeLost}
              onTouchEnd={(e) => {
                e.preventDefault();
                continueAfterLifeLost();
              }}
              className="bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] hover:bg-[hsl(var(--game-glow))] text-base sm:text-xl px-6 sm:px-8 py-3 sm:py-4 font-mono"
            >
              PRESS TO CONTINUE
            </Button>
            <div className="text-sm sm:text-lg font-mono text-[hsl(var(--game-foreground))] mt-3 sm:mt-4 opacity-70">
              LIVES REMAINING: {displayLives}
            </div>
          </div>
        )}

        {showGameOver && gameMode === "solo" && (
          <GameOverPanel
            score={displayScore}
            runSummary={runSummary}
            boardTitle={HIGH_SCORES_ENABLED ? "CLOUD LEADERBOARD" : "LOCAL HIGH SCORES"}
            entries={(HIGH_SCORES_ENABLED ? leaderboard : localHighScores).slice(0, 10)}
            enteringInitials={enteringInitials}
            initials={initials}
            hasStoredInitials={!!localStorage.getItem("playerInitials")}
            isTouchDevice={isTouchDevice}
            cloudStatus={cloudStatus}
            statusText={initialsError}
            onRetryCloud={retryCloudSubmission}
            selection={gameOverSelection}
            onInitialsChange={(v) => { setInitials(v); setInitialsError(""); setCloudStatus("idle"); }}
            onSubmitInitials={() => submitInitials(initials, displayScore)}
            onPlayAgain={initGame}
            onMenu={quitToMenu}
          />
        )}

        {/* Co-op game over statistics overlay */}
        {coopGameOver && (gameMode === "coop" || gameMode === "online_coop") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-10 overflow-auto py-4">
            <div
              className="text-3xl sm:text-4xl font-mono text-[hsl(var(--game-danger))] mb-2 animate-pulse"
              style={{ fontFamily: "'Press Start 2P', monospace" }}
            >
              GAME OVER
            </div>
            <div
              className="text-base sm:text-lg font-mono mb-5"
              style={{ fontFamily: "'Press Start 2P', monospace", color: "#44FF88", textShadow: "0 0 10px #44FF88" }}
            >
              WAVE {coopWave} — TOTAL: {coopScore.toString().padStart(8, "0")}
            </div>

            {/* Statistics table */}
            <div className="w-full max-w-xl px-4 mb-6">
              <div
                className="text-xs font-mono mb-3 text-center tracking-widest opacity-70"
                style={{ fontFamily: "'Press Start 2P', monospace", color: "#FFFF00" }}
              >
                PLAYER STATISTICS
              </div>

              {/* Header row */}
              <div
                className="grid grid-cols-5 gap-1 text-[7px] sm:text-[8px] font-mono mb-2 opacity-50"
                style={{ fontFamily: "'Press Start 2P', monospace", color: "#FFFFFF" }}
              >
                <div className="text-left pl-1">PLAYER</div>
                <div className="text-right">SCORE</div>
                <div className="text-right">ROCKS</div>
                <div className="text-right">ENEMIES</div>
                <div className="text-right pr-1">POWER-UPS</div>
              </div>

              {/* Player rows sorted by score */}
              {(coopPlayerStats.length > 0
                ? coopPlayerStats
                : Array.from({ length: coopPlayerCount }, (_, i) => ({
                    playerIndex: i,
                    label:
                      gameMode === "online_coop" ? (multiplayer.playerInitialsMap.get(i) ?? `P${i + 1}`) : `P${i + 1}`,
                    score: 0,
                    asteroidsDestroyed: 0,
                    enemiesKilled: 0,
                    powerUpsCollected: 0,
                  }))
              ).map((stat, rank) => {
                const color = PLAYER_COLORS[stat.playerIndex % PLAYER_COLORS.length];
                const label =
                  gameMode === "online_coop"
                    ? (multiplayer.playerInitialsMap.get(stat.playerIndex) ?? stat.label)
                    : stat.label;
                return (
                  <div
                    key={stat.playerIndex}
                    className="grid grid-cols-5 gap-1 py-2 border-b border-white/10"
                    style={{ borderColor: `${color}22` }}
                  >
                    <div
                      className="flex items-center gap-1 text-[8px] sm:text-[9px] font-mono pl-1"
                      style={{ fontFamily: "'Press Start 2P', monospace", color, textShadow: `0 0 8px ${color}` }}
                    >
                      <span className="opacity-50 text-white">{rank + 1}.</span> {label}
                    </div>
                    <div
                      className="text-right text-[8px] sm:text-[9px] font-mono"
                      style={{ fontFamily: "'Press Start 2P', monospace", color: "#FFFF00" }}
                    >
                      {stat.score.toString().padStart(6, "0")}
                    </div>
                    <div
                      className="text-right text-[8px] sm:text-[9px] font-mono"
                      style={{ fontFamily: "'Press Start 2P', monospace", color: "#FFFFFF" }}
                    >
                      {stat.asteroidsDestroyed}
                    </div>
                    <div
                      className="text-right text-[8px] sm:text-[9px] font-mono"
                      style={{ fontFamily: "'Press Start 2P', monospace", color: "#FF8844" }}
                    >
                      {stat.enemiesKilled}
                    </div>
                    <div
                      className="text-right text-[8px] sm:text-[9px] font-mono pr-1"
                      style={{ fontFamily: "'Press Start 2P', monospace", color: "#CC66FF" }}
                    >
                      {stat.powerUpsCollected}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-4">
              {gameMode === "coop" && (
                <Button
                  onClick={() => initCoop(false, coopPlayerCount)}
                  className="text-base sm:text-lg px-6 py-3 font-mono"
                  style={{ fontFamily: "'Press Start 2P', monospace" }}
                >
                  PLAY AGAIN
                </Button>
              )}
              {gameMode === "online_coop" &&
                multiplayer.isHost &&
                (multiplayer.guestCount === 0 ? (
                  // No guests connected — show waiting message instead of RESTART
                  <div
                    className="text-sm font-mono animate-pulse"
                    style={{ fontFamily: "'Press Start 2P', monospace", color: "#AAAAAA" }}
                  >
                    Waiting for players…
                  </div>
                ) : (
                  <Button
                    onClick={() => {
                      // Use the ref (not state) to get the accurate guest count at click time,
                      // avoiding stale values from asynchronous presence updates.
                      const currentGuestCount = multiplayer.guestCountRef.current ?? multiplayer.guestCount;
                      // Use the authoritative player count from the coop worker if it is higher
                      // than the current presence count (handles mid-game spectator promotions).
                      // If lastCoopPlayerCountRef is 0 (no state received yet), Math.max falls
                      // back to the presence-derived count, preserving existing behaviour.
                      const totalPlayers = Math.max(currentGuestCount + 1, lastCoopPlayerCountRef.current);
                      readyPlayerIdxsRef.current = new Set();
                      expectedGuestsForRestartRef.current = totalPlayers - 1;
                      multiplayer.setGameInProgress(true);
                      if (totalPlayers <= 2) {
                        // Only 2 players — no countdown, broadcast without deadline so guest
                        // sees READY button immediately; game starts when they press it.
                        // Ensure any previous countdown state is cleared.
                        restartDeadlineRef.current = null;
                        setRestartCountdown(null);
                        multiplayer.sendGameRestart(undefined, totalPlayers);
                        // Host waits for the single guest's player_ready signal
                      } else {
                        // 3+ players — trigger a 20-second countdown
                        const deadline = Date.now() + 20_000;
                        restartDeadlineRef.current = deadline;
                        setRestartCountdown(20);
                        setCountdownKey((k) => k + 1);
                        multiplayer.sendGameRestart(deadline, totalPlayers);
                      }
                    }}
                    className="text-base sm:text-lg px-6 py-3 font-mono"
                    style={{ fontFamily: "'Press Start 2P', monospace" }}
                    disabled={restartCountdown != null && restartCountdown > 0}
                  >
                    {restartCountdown != null && restartCountdown > 0 ? `WAITING ${restartCountdown}s` : "RESTART"}
                  </Button>
                ))}
              {gameMode === "online_coop" && !multiplayer.isHost && hostRestarted && (
                <div className="flex flex-col items-center gap-2">
                  {restartCountdown != null && restartCountdown > 0 && (
                    <span
                      style={{
                        fontFamily: "'Press Start 2P', monospace",
                        fontSize: 14,
                        color: restartCountdown <= 5 ? "#FF4444" : "#FFD700",
                        textShadow: `0 0 10px ${restartCountdown <= 5 ? "#FF4444" : "#FFD700"}`,
                      }}
                    >
                      STARTING IN {restartCountdown}s
                    </span>
                  )}
                  <Button
                    onClick={() => {
                      // Notify host that this player is ready
                      multiplayer.sendPlayerReady();
                      setHostRestarted(false);
                      setIsSpectating(false);
                      restartDeadlineRef.current = null;
                      setRestartCountdown(null);
                      initOnlineCoop(false, coopPlayerCount);
                    }}
                    className="text-base sm:text-lg px-6 py-3 font-mono animate-pulse"
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      background: "#44FF88",
                      color: "#000000",
                      boxShadow: "0 0 20px #44FF88",
                    }}
                  >
                    READY
                  </Button>
                </div>
              )}
              <Button
                onClick={quitToMenu}
                variant="outline"
                className="text-base sm:text-lg px-6 py-3 font-mono border-[hsl(var(--game-foreground))] text-[hsl(var(--game-foreground))]"
                style={{ fontFamily: "'Press Start 2P', monospace" }}
              >
                MENU
              </Button>
            </div>
          </div>
        )}

        {/* Pause overlay */}
        {isPaused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 z-10">
            <div
              className="text-3xl sm:text-5xl font-mono text-[hsl(var(--game-foreground))] mb-6 sm:mb-8 tracking-widest animate-pulse"
              style={{ textShadow: "0 0 30px hsl(var(--game-foreground))" }}
            >
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
                onClick={() => setShowSettings(true)}
                className={`text-xl px-10 py-5 font-mono tracking-wider transition-all ${
                  pauseSelection === 1
                    ? "bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] shadow-[0_0_20px_hsl(var(--game-foreground))]"
                    : "bg-[hsl(var(--game-foreground))]/20 text-[hsl(var(--game-foreground))] border border-[hsl(var(--game-foreground))]/40"
                }`}
              >
                {pauseSelection === 1 ? "▸ " : "  "}SETTINGS
              </Button>
              <Button
                onClick={() => {
                  resumeGame();
                  quitToMenu();
                }}
                className={`text-xl px-10 py-5 font-mono tracking-wider transition-all ${
                  pauseSelection === 2
                    ? "bg-[hsl(var(--game-danger))] text-[hsl(var(--game-background))] shadow-[0_0_20px_hsl(var(--game-danger))]"
                    : "bg-[hsl(var(--game-foreground))]/10 text-[hsl(var(--game-foreground))]/60 border border-[hsl(var(--game-foreground))]/20"
                }`}
              >
                {pauseSelection === 2 ? "▸ " : "  "}QUIT TO MENU
              </Button>
            </div>
            <div className="text-[hsl(var(--game-foreground))] font-mono text-xs opacity-40">
              ESC or START to resume
            </div>
          </div>
        )}

        {/* Settings overlay (from pause menu) */}
        {showSettings && (
          <ControlSettings
            bindings={controlBindingsRef.current}
            onSave={(newBindings) => {
              controlBindingsRef.current = newBindings;
              if (gameStateRef.current) gameStateRef.current.ship.rotationSpeed = newBindings.turnSpeed;
              setShowSettings(false);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Duel / Co-op quit button */}
        {isMultiplayerMode(gameMode) && !isPaused && (
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

        {/* FPS overlay (debug only) */}
        {DEBUG_ENABLED && <FpsOverlay />}

        {/* Countdown overlay during active online_coop game (after pressing READY) */}
        {gameMode === "online_coop" && !coopGameOver && restartCountdown != null && restartCountdown > 0 && (
          <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none z-10">
            <div
              className="px-4 py-2 font-mono text-sm animate-pulse"
              style={{
                background: "rgba(0,0,0,0.7)",
                color: restartCountdown <= 5 ? "#FF4444" : "#FFD700",
                fontFamily: "'Press Start 2P', monospace",
                textShadow: `0 0 10px ${restartCountdown <= 5 ? "#FF4444" : "#FFD700"}`,
                border: `1px solid ${restartCountdown <= 5 ? "#FF4444" : "#FFD700"}`,
              }}
            >
              GAME STARTING IN {restartCountdown}s
            </div>
          </div>
        )}

        {/* Spectating indicator for late-joining spectators */}
        {gameMode === "online_coop" && !multiplayer.isHost && isSpectating && !coopGameOver && (
          <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
            <div
              className="px-3 py-1 font-mono text-xs animate-pulse"
              style={{
                background: "rgba(0,0,0,0.6)",
                color: "#44FF88",
                fontFamily: "'Press Start 2P', monospace",
                textShadow: "0 0 8px #44FF88",
              }}
            >
              SPECTATING — You'll join next round
            </div>
          </div>
        )}

        {/* Collapsible chat overlay during online gameplay — top-left, toggled with TAB */}
        {(gameMode === "online_coop" || gameMode === "online") && (
          <div className="absolute top-2 left-2 z-20" style={{ maxWidth: "20rem" }}>
            {isChatOpen ? (
              <div
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsChatOpen(false);
                    canvasRef.current?.focus();
                  }
                }}
              >
                <LobbyChat messages={multiplayer.chatMessages} onSend={(text) => multiplayer.sendChatMessage(text)} />
              </div>
            ) : (
              <button
                onClick={() => setIsChatOpen(true)}
                className="font-mono text-xs px-2 py-1 border border-[hsl(var(--game-foreground))]/30 text-[hsl(var(--game-foreground))]/50 hover:text-[hsl(var(--game-foreground))]/80 hover:border-[hsl(var(--game-foreground))]/60 transition-colors"
                style={{ background: "rgba(0,0,0,0.5)" }}
                tabIndex={-1}
              >
                CHAT [TAB]
              </button>
            )}
          </div>
        )}

        {/* Player list overlay with ping — top-right, always visible during online co-op.
             pointer-events-none keeps it from blocking the QUIT button at the same position. */}
        {(gameMode === "online_coop" || gameMode === "online") && (
          <div className="pointer-events-none">
            <PlayerList
              playerInitialsMap={multiplayer.playerInitialsMap}
              pingMap={multiplayer.pingMap}
              localPlayerIdx={multiplayer.playerIdxRef.current}
            />
          </div>
        )}

        {/* Host disconnected modal */}
        {(gameModeRef.current === "online_coop" || gameModeRef.current === "online" || gameModeRef.current === "online_lobby") && multiplayer.hostDisconnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50">
            <div
              className="text-3xl sm:text-4xl font-mono text-[hsl(var(--game-danger))] mb-8 animate-pulse text-center"
              style={{ fontFamily: "'Press Start 2P', monospace", textShadow: "0 0 20px hsl(var(--game-danger))" }}
            >
              HOST ENDED GAME!
            </div>
            <Button
              onClick={quitToMenu}
              className="text-base sm:text-xl px-8 py-4 font-mono"
              style={{ fontFamily: "'Press Start 2P', monospace" }}
            >
              GO BACK TO MAIN MENU
            </Button>
          </div>
        )}

        {/* Debug panel overlay */}
        {DEBUG_ENABLED && showDebugPanel && (
          <div
            className="absolute inset-0 bg-black/80 z-20 overflow-auto p-4 font-mono text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <div className="text-[#00FF00] text-sm">DEBUG LOG</div>
              <button
                onClick={() => setShowDebugPanel(false)}
                className="text-[hsl(var(--game-foreground))] opacity-70 hover:opacity-100"
              >
                ✕ CLOSE
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {DEBUG_CATEGORIES.map((cat) => (
                <label key={cat} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={debugCategories.has(cat)}
                    onChange={() =>
                      setDebugCategories((prev) => {
                        const next = new Set(prev);
                        if (next.has(cat)) next.delete(cat);
                        else next.add(cat);
                        return next;
                      })
                    }
                    className="accent-[#00FF00]"
                  />
                  <span className="text-[#00FF00] uppercase">{cat}</span>
                </label>
              ))}
            </div>
            <button
              onClick={() => {
                debugLogsRef.current = [];
                setDebugLogs([]);
              }}
              className="text-[#FF4444] mb-2 hover:underline"
            >
              CLEAR
            </button>
            <div className="max-h-[400px] overflow-auto border border-[#00FF00]/30 p-2">
              {debugLogs
                .filter((l) => debugCategories.has(l.category))
                .slice()
                .reverse()
                .map((log, i) => (
                  <div key={i} className="text-[#00FF00]/80 py-0.5 border-b border-[#00FF00]/10">
                    <span className="text-[#00FF00]/50">{new Date(log.timestamp).toLocaleTimeString()}</span>{" "}
                    <span className="text-[#FFAA00]">[{log.category}]</span> {log.message}
                  </div>
                ))}
              {debugLogs.filter((l) => debugCategories.has(l.category)).length === 0 && (
                <div className="text-[#00FF00]/40">No log entries matching filters</div>
              )}
            </div>
          </div>
        )}

        {/* Mobile debug toggle button */}
        {DEBUG_ENABLED && isTouchDevice && (
          <button
            onClick={() => setShowDebugPanel((prev) => !prev)}
            className="absolute top-2 left-2 z-30 w-8 h-8 rounded border border-[#00FF00]/30 text-[#00FF00] font-mono text-xs flex items-center justify-center opacity-30 hover:opacity-80"
          >
            §
          </button>
        )}
      </div>

      <div className="mt-2 w-full max-w-[800px]">
        <RadioMiniPlayer
          audioRef={audioRef}
          isPlaying={isRadioPlaying}
          nowPlaying={nowPlaying}
          autoPlayMusic={autoPlayMusic}
          onToggleAutoPlay={() => setAutoPlayMusic((enabled) => !enabled)}
          onPauseGame={isTouchDevice ? togglePause : undefined}
        />
      </div>

      {DEBUG_ENABLED && (
        <label className="flex h-5 items-center gap-2 font-mono text-[10px] text-[hsl(var(--game-danger))] opacity-70">
          <input
            type="checkbox"
            checked={trainerMode}
            onChange={(e) => setTrainerMode(e.target.checked)}
            className="accent-[hsl(var(--game-danger))]"
          />
          TRAINER (NO SCORES)
        </label>
      )}

      {isTouchDevice && (gameMode === "solo" || gameMode === "online_coop" || gameMode === "online") && (
        <div
          className="mt-auto w-full max-w-[800px] select-none touch-none px-2 [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            aria-label="Hyperspace"
            className="mx-auto mb-2 flex h-11 min-w-[120px] touch-none select-none items-center justify-center rounded-full border-2 border-[hsl(var(--game-powerup))] bg-[hsl(var(--game-background))]/70 px-4 font-mono text-[10px] font-bold text-[hsl(var(--game-powerup))] shadow-[0_0_10px_hsl(var(--game-powerup)/0.3)] backdrop-blur-sm active:bg-[hsl(var(--game-powerup))]/25 motion-safe:transition-transform motion-safe:active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={(e) => {
              e.preventDefault();
              hyperspace();
            }}
          >
            HYPERSPACE
          </button>
          <div className="flex items-end justify-between gap-4">
            <div className="flex gap-4">
              <button
                type="button"
                aria-label="Rotate left"
                className="flex h-[72px] w-[72px] touch-none select-none items-center justify-center rounded-full border-2 border-[hsl(var(--game-foreground))] bg-[hsl(var(--game-background))]/70 font-mono text-2xl text-[hsl(var(--game-foreground))] shadow-[0_0_10px_hsl(var(--game-foreground)/0.3)] backdrop-blur-sm active:bg-[hsl(var(--game-foreground))]/25 motion-safe:transition-transform motion-safe:active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
                onContextMenu={(e) => e.preventDefault()}
                onTouchStart={(e) => { e.preventDefault(); keysRef.current["ArrowLeft"] = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current["ArrowLeft"] = false; }}
                onTouchCancel={(e) => { e.preventDefault(); keysRef.current["ArrowLeft"] = false; }}
              >
                <span aria-hidden="true">◀</span>
              </button>
              <button
                type="button"
                aria-label="Rotate right"
                className="flex h-[72px] w-[72px] touch-none select-none items-center justify-center rounded-full border-2 border-[hsl(var(--game-foreground))] bg-[hsl(var(--game-background))]/70 font-mono text-2xl text-[hsl(var(--game-foreground))] shadow-[0_0_10px_hsl(var(--game-foreground)/0.3)] backdrop-blur-sm active:bg-[hsl(var(--game-foreground))]/25 motion-safe:transition-transform motion-safe:active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
                onContextMenu={(e) => e.preventDefault()}
                onTouchStart={(e) => { e.preventDefault(); keysRef.current["ArrowRight"] = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current["ArrowRight"] = false; }}
                onTouchCancel={(e) => { e.preventDefault(); keysRef.current["ArrowRight"] = false; }}
              >
                <span aria-hidden="true">▶</span>
              </button>
            </div>
            <div className="flex items-end gap-3">
              <button
                type="button"
                aria-label="Thrust"
                className="flex h-[72px] w-[72px] touch-none select-none items-center justify-center rounded-full border-2 border-[hsl(var(--game-glow))] bg-[hsl(var(--game-background))]/70 text-2xl text-[hsl(var(--game-glow))] shadow-[0_0_10px_hsl(var(--game-glow)/0.3)] backdrop-blur-sm active:bg-[hsl(var(--game-glow))]/25 motion-safe:transition-transform motion-safe:active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
                onContextMenu={(e) => e.preventDefault()}
                onTouchStart={(e) => { e.preventDefault(); keysRef.current["ArrowUp"] = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current["ArrowUp"] = false; }}
                onTouchCancel={(e) => { e.preventDefault(); keysRef.current["ArrowUp"] = false; }}
              >
                <span aria-hidden="true">▲</span><span className="sr-only">Thrust</span>
              </button>
              <button
                type="button"
                aria-label="Fire"
                className="flex h-20 w-20 touch-none select-none items-center justify-center rounded-full border-2 border-[hsl(var(--game-danger))] bg-[hsl(var(--game-background))]/70 text-3xl text-[hsl(var(--game-danger))] shadow-[0_0_10px_hsl(var(--game-danger)/0.3)] backdrop-blur-sm active:bg-[hsl(var(--game-danger))]/25 motion-safe:transition-transform motion-safe:active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
                onContextMenu={(e) => e.preventDefault()}
                onTouchStart={(e) => { e.preventDefault(); shootBullet(); keysRef.current[" "] = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current[" "] = false; }}
                onTouchCancel={(e) => { e.preventDefault(); keysRef.current[" "] = false; }}
              >
                <span aria-hidden="true">◎</span><span className="sr-only">Fire</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {!isTouchDevice && (
        <div className="mt-2 w-full max-w-[800px] font-mono text-[10px] text-[hsl(var(--game-foreground))] opacity-70">
          {gameMode === "solo" && (
            <div className="flex flex-col items-center gap-1">
              <span className="whitespace-nowrap">⌨ ← → ROTATE | ↑ THRUST | SPACE FIRE | CTRL HYPER | ESC PAUSE</span>
              <span className="whitespace-nowrap">🎮 STICK MOVE | A FIRE | B HYPER | X THRUST | START PAUSE</span>
            </div>
          )}
          {gameMode === "duel" && (
            <div className="flex flex-col items-center gap-1">
              <span className="whitespace-nowrap"><span style={{ color: P1_COLOR }}>P1: ←→↑ SPACE</span> | <span style={{ color: P2_COLOR }}>P2: WASD E</span></span>
              <span className="whitespace-nowrap">🎮 GP1/GP2 | A FIRE | B HYPER | ESC PAUSE</span>
            </div>
          )}
          {(gameMode === "coop" || gameMode === "online_coop") && (
            <div className="flex flex-col items-center gap-1">
              <span className="whitespace-nowrap"><span style={{ color: P1_COLOR }}>P1: ←→↑ SPACE</span> | <span style={{ color: P2_COLOR }}>{gameMode === "coop" ? "P2: WASD E" : "P2: Remote"}</span></span>
              <span className="whitespace-nowrap">🎮 GP1/GP2 | A FIRE | ESC PAUSE</span>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (quitConfirm) {
            if (quitConfirmTimerRef.current) clearTimeout(quitConfirmTimerRef.current);
            quitToMenu();
            return;
          }
          setQuitConfirm(true);
          if (quitConfirmTimerRef.current) clearTimeout(quitConfirmTimerRef.current);
          quitConfirmTimerRef.current = setTimeout(() => setQuitConfirm(false), 3000);
        }}
        className="mt-1 min-h-11 px-4 font-mono text-[10px] text-[hsl(var(--game-foreground))] opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary uppercase tracking-widest"
      >
        {quitConfirm ? "TAP AGAIN TO QUIT" : "main menu"}
      </button>
    </div>
  );
};

export default Game;
