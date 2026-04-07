// Shared game constants — single source of truth for all magic numbers.

/** Set to true to re-enable the server high scores / anti-cheat system. */
export const HIGH_SCORES_ENABLED = false;

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

/** Human-readable names for each boss type. */
export const BOSS_NAMES: Record<string, string> = {
  tentacle: "BOSS",
  amigaBall: "AMIGA BALL",
  flyingSaucer: "FLYING SAUCER",
  borgCube: "BORG CUBE",
};
