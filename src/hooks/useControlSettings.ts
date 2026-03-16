export interface KeyBindings {
  left: string;
  right: string;
  thrust: string;
  fire: string;
  hyperspace: string;
}

export interface GamepadBindings {
  fire: number;
  hyperspace: number;
  thrust: number;
}

export interface ControlBindings {
  p1: KeyBindings;
  p2: KeyBindings;
  gamepad: GamepadBindings;
  turnSpeed: number;
}

export const DEFAULT_BINDINGS: ControlBindings = {
  p1: {
    left: "ArrowLeft",
    right: "ArrowRight",
    thrust: "ArrowUp",
    fire: " ",
    hyperspace: "Control",
  },
  p2: {
    left: "a",
    right: "d",
    thrust: "w",
    fire: "e",
    hyperspace: "q",
  },
  gamepad: {
    fire: 0,       // A button
    hyperspace: 1, // B button
    thrust: 2,     // X button
  },
  turnSpeed: 0.055,
};

const STORAGE_KEY = "controlSettings";

export function loadBindings(): ControlBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ControlBindings;
      // Validate structure
      if (parsed.p1 && parsed.p2 && parsed.gamepad) {
        return parsed;
      }
    }
  } catch {
    // fall through
  }
  return { ...DEFAULT_BINDINGS };
}

export function saveBindings(bindings: ControlBindings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

/** Maps key codes to user-friendly display names */
export function displayKeyName(key: string): string {
  const map: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    " ": "Space",
    Control: "Ctrl",
    Shift: "Shift",
    Alt: "Alt",
    Enter: "Enter",
    Backspace: "Bksp",
    Tab: "Tab",
    Escape: "Esc",
    CapsLock: "Caps",
  };
  return map[key] || key.toUpperCase();
}
