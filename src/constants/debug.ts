// Set to true to enable debug logging panel, trainer mode, and level skip cheats.
// This flag gates ALL debug features — when false, zero overhead.
export const DEBUG_ENABLED = true;

export type DebugCategory = "collision" | "spawn" | "wave" | "powerup" | "death" | "boss" | "input";

export const DEBUG_CATEGORIES: DebugCategory[] = ["collision", "spawn", "wave", "powerup", "death", "boss", "input"];

export interface DebugLogEntry {
  timestamp: number;
  category: DebugCategory;
  message: string;
}
