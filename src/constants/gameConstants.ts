// Shared game constants — single source of truth for all magic numbers.

/** Set to true to re-enable the server high scores / anti-cheat system. */
export const HIGH_SCORES_ENABLED = true;

/** Frames of invulnerability after respawn / hyperspace (120 = 2 seconds at 60 Hz). */
export const SPAWN_INVULNERABILITY_FRAMES = 120;

/** Duration (frames) of the shield power-up at 60 Hz. */
export const SHIELD_DURATION = 300;

/** Duration (frames) of the rapid-fire power-up at 60 Hz. */
export const RAPID_FIRE_DURATION = 600;

/** Duration (frames) of the score multiplier power-up at 60 Hz. */
export const MULTIPLIER_DURATION = 900;

/** Probability of a power-up dropping from a destroyed enemy in solo mode. */
export const POWERUP_DROP_RATE_SOLO = 0.15;

/** Probability of a power-up dropping from a destroyed enemy in co-op mode. */
export const POWERUP_DROP_RATE_COOP = 0.2;

/** Lifetime (frames) of a standard bullet at 60 Hz. */
export const BULLET_LIFETIME = 60;

/** Default ship rotation speed (radians per frame). */
export const DEFAULT_TURN_SPEED = 0.05;

/** Boss types in wave-cycle order (wave 5 → index 0, wave 10 → index 1, etc.). */
export const BOSS_TYPES = ["amigaBall", "flyingSaucer", "tentacle", "borgCube"] as const;

/** Minimum score required to qualify for the local high-score prompt. */
export const MIN_SCORE_FOR_INITIALS = 1000;

/** Human-readable names for each boss type. */
export const BOSS_NAMES: Record<string, string> = {
  tentacle: "BOSS",
  amigaBall: "AMIGA BALL",
  flyingSaucer: "FLYING SAUCER",
  borgCube: "BORG CUBE",
};

// ===== BALANCE (solo lives & reward economy) =====
// DROP_RATE: chance per kill (large asteroid 8%, medium 4%, small 0%, UFO 30%/50%, alien 25%).
// Max 2 power-ups on screen, 300-tick (5 s) cooldown between drops, normal drops live 420 ticks (7 s).
// PITY_TICKS: 1800 ticks (30 s) without a drop guarantees the next non-small-asteroid drop.
// EXTRA_LIFE_DROP: weight 6 (12 at 1 life) added to the pool only at <=3 lives,
// at least 3600 ticks (60 s) apart and max 1 per wave.
export const BALANCE = {
  // Base pickup bonus points (doubled while the 2x score power-up is active).
  PICKUP_SCORE: { shield: 150, rapidFire: 150, multiplier: 200, extraLife: 500 },
  // Solo shield: 420 ticks = 7 s at 60 Hz; shared SHIELD_DURATION stays 300.
  SHIELD_SOLO_TICKS: 420,
  EXTRA_LIFE_FIRST: 10000,
  EXTRA_LIFE_STEP: 10000,
  MAX_LIVES: 5,
  DROP_RATE: { asteroidLarge: 0.08, asteroidMedium: 0.04, asteroidSmall: 0, ufoLarge: 0.30, ufoSmall: 0.50, alien: 0.25 },
  DROP_WEIGHTS: { shield: 40, rapidFire: 30, multiplier: 30 },
  BOSS_DROP_WEIGHTS: { extraLife: 35, shield: 35, rapidFire: 15, multiplier: 15 },
  MAX_POWERUPS_ON_SCREEN: 2,
  DROP_COOLDOWN_TICKS: 300,
  POWERUP_LIFETIME_TICKS: 420,
  PITY_TICKS: 1800,
  EXTRA_LIFE_DROP: { WEIGHT: 6, WEIGHT_LOW: 12, MAX_LIVES_FOR_DROP: 3, MIN_GAP_TICKS: 3600, MAX_PER_WAVE: 1 },
  ALIENS: {
    INTRO_WAVE: { brown: 3, greenMan: 7, blueSentinel: 11, purpleSwarm: 14 },
    TYPE_CAP: { brown: 2, greenMan: 1, blueSentinel: 1, purpleSwarm: 1 },
    GREEN_CAP_LATE: 2,
    GREEN_CAP_LATE_WAVE: 16,
    WEIGHTS: { brown: 4, greenMan: 3, blueSentinel: 2, purpleSwarm: 2 },
    BUDGET_BASE: 2,
    BUDGET_PER_WAVES: 3,
    BUDGET_MAX: 7,
    FIRST_EVENT_TICKS: 600,
    RETRY_TICKS: 120,
    INTERVAL_MIN: 420,
    INTERVAL_BASE: 720,
    INTERVAL_PER_WAVE: 12,
    INTERVAL_RAND: 300,
  },
  GREEN: {
    BULLET_SPEED: 4.5,
    BULLET_LIFETIME: 56,
    SCATTER_MIN: 0.22,
    SCATTER_BASE: 0.34,
    SCATTER_PER_WAVE: 0.0065,
    FIRE_MIN: 90,
    FIRE_BASE: 140,
    FIRE_PER_WAVE: 2,
    FIRE_RAND: 60,
    INITIAL_SHOOT_MIN: 120,
    INITIAL_SHOOT_RAND: 60,
    SCREEN_MARGIN: 30,
    MAX_BULLETS: 3,
    TELEGRAPH_TICKS: 20,
  },
  BLUE: {
    TELEPORT_COOLDOWN: 420,
    TELEPORT_RAND: 180,
    CHARGE_TICKS: 45,
    EDGE_MARGIN: 50,
    MIN_SHIP_DIST: 220,
    DEST_TRIES: 20,
    ARRIVE_NO_FIRE: 60,
    BURST_GAP: 180,
    BURST_GAP_RAND: 60,
    LIFETIME_TICKS: 1800,
  },
  // Solo respawn / wave-start safety: respawn search area and lookahead, asteroid spawn distance, start grace.
  SAFETY: {
    RESPAWN_MARGIN_X: 100,
    RESPAWN_MARGIN_Y: 80,
    RESPAWN_LOOKAHEAD_TICKS: [0, 30, 60, 90],
    WAVE_START_MIN_DIST: 220,
    WAVE_START_GRACE_TICKS: 60,
    BOSS_START_GRACE_TICKS: 120,
  },
  UFO: {
    SMALL_AFTER_WAVE: 9,
    SMALL_CHANCE: 0.35,
    INTERVAL_MIN: 600,
    INTERVAL_BASE: 1200,
    INTERVAL_PER_WAVE: 25,
    INTERVAL_RAND: 400,
    SMALL_SCATTER: 0.12,
  },
  // Solo enemy entry warnings and clearance from a ship parked at the edge.
  WARNING: {
    TICKS: 120,
    BLINK_LAST_TICKS: 30,
    GUARD_EDGE_PX: 100,
    GUARD_Y_PX: 80,
    GUARD_TRIES: 10,
  },
  // Boing ball: flat original proportions and readable solo bounce stages.
  AMIGA: {
    HP_MUL: 1.8,
    RADIUS: 50,
    TILT_DEG: 19,
    SPIN_PER_TICK: 0.05,
    DROP_SHADOW_X: 0.45,
    FLOOR_OFFSET: 80,
    GRAVITY: 0.10,
    BOUNCE_VY: [8.0, 9.0, 9.8],
    BOUNCE_VARIANCE: 0.06,
    SPEED_X_BASE: 1.6, SPEED_X_PER_WAVE: 0.06, SPEED_X_STAGE_MUL: [1, 1.2, 1.45], SPEED_X_MAX: 4.5,
    STAGE_HP: [0.66, 0.40],
    TURN_TO_SHIP: [0, 0.3, 0.5],
    BURST_COUNT: [8, 10, 12], BURST_SPEED: [2.0, 2.2, 2.4], BURST_INTERVAL_MUL: [1, 0.8, 0.65], BURST_MIN_TICKS: 60,
    SLAM_PER_SIDE: [1, 1, 2], SLAM_SPEED: [3.5, 4.0, 4.5], SLAM_EXTRA_SPEED: 1.5,
    VOLLEY_COUNT: [0, 3, 5], VOLLEY_SPREAD_DEG: 12, VOLLEY_SPEED: [0, 3.0, 3.4],
    FIRST_DASH_TICKS: 90,
    DASH_INTERVAL_TICKS: [300, 420], DASH_HOVER_TICKS: 75, DASH_LOCK_TICKS: 30, DASH_TRACK_SPEED: 1.5, DASH_DROP_SPEED: 11,
  },
} as const;

export type DropSource = keyof typeof BALANCE.DROP_RATE;

/** Score threshold for the n-th extra life (n = 1, 2, 3…): 10k, 30k, 60k, 100k, 150k… */
export const extraLifeThreshold = (n: number): number =>
  BALANCE.EXTRA_LIFE_FIRST * n + (BALANCE.EXTRA_LIFE_STEP * n * (n - 1)) / 2;
