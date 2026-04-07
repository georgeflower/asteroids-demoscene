/**
 * useInput — keyboard, gamepad, and touch input abstraction.
 *
 * Provides the `readGamepad` utility function and a `useKeyboardState` hook
 * for tracking which keys are currently pressed.
 */
import { useRef, useEffect, useCallback } from "react";
import type { MutableRefObject } from "react";
import type { ControlBindings } from "@/hooks/useControlSettings";

const GAMEPAD_DEADZONE = 0.2;

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  fire: boolean;
  hyperspace: boolean;
}

/**
 * Reads gamepad state for the given index using the current control bindings.
 */
export function readGamepad(
  index: number,
  controlBindings: ControlBindings,
): InputState {
  const result: InputState = { left: false, right: false, up: false, fire: false, hyperspace: false };
  try {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[index];
    if (!gp) return result;
    if (gp.axes[0] < -GAMEPAD_DEADZONE) result.left = true;
    if (gp.axes[0] > GAMEPAD_DEADZONE) result.right = true;
    if (gp.axes[1] < -GAMEPAD_DEADZONE) result.up = true;
    if (gp.buttons[14]?.pressed) result.left = true;
    if (gp.buttons[15]?.pressed) result.right = true;
    if (gp.buttons[12]?.pressed) result.up = true;
    const gb = controlBindings.gamepad;
    if (gp.buttons[gb.fire]?.pressed) result.fire = true;
    if (gp.buttons[gb.hyperspace]?.pressed) result.hyperspace = true;
    if (gp.buttons[gb.thrust]?.pressed) result.up = true;
  } catch {
    /* no gamepad API */
  }
  return result;
}

/**
 * Tracks which keyboard keys are currently pressed.
 * Returns a stable ref object updated on keydown/keyup events.
 */
export function useKeyboardState(): MutableRefObject<Record<string, boolean>> {
  const keysRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      keysRef.current[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
      keysRef.current[e.code] = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return keysRef;
}

/**
 * Returns a stable function that merges keyboard and gamepad input
 * for a given player index.
 */
export function usePlayerInput(
  keysRef: MutableRefObject<Record<string, boolean>>,
  controlBindingsRef: MutableRefObject<ControlBindings>,
) {
  const getInput = useCallback((playerIndex: number): InputState => {
    const b = controlBindingsRef.current;
    const gp = readGamepad(playerIndex, b);
    const kb = keysRef.current;
    const bindings = playerIndex === 0 ? b.p1 : b.p2;
    return {
      left: !!(kb[bindings.left] || gp.left),
      right: !!(kb[bindings.right] || gp.right),
      up: !!(kb[bindings.thrust] || gp.up),
      fire: !!(kb[bindings.fire] || gp.fire),
      hyperspace: !!(kb[bindings.hyperspace] || gp.hyperspace),
    };
  }, [keysRef, controlBindingsRef]);

  return { getInput };
}
