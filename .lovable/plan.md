

# Settings Menu for Key Bindings

## Overview
Add a "SETTINGS" button to the main menu that opens a fullscreen overlay where players can rebind keyboard and gamepad controls for P1 and P2. Bindings persist in localStorage and are reflected in control instructions below the canvas and on the main menu.

## Actions & Default Bindings

| Action | P1 Keyboard Default | P2 Keyboard Default |
|---------|---------------------|---------------------|
| Steer Left | ArrowLeft | A |
| Steer Right | ArrowRight | D |
| Thrust | ArrowUp | W |
| Fire | Space | E |
| Hyperspace | Control | (none in duel) |

Gamepad (Xbox layout): Left Stick / D-Pad for steer+thrust, A = Fire, B = Hyperspace, X = Thrust (alt). Display-only mapping table (not rebindable — gamepad buttons are standard).

## Implementation

### 1. New file: `src/hooks/useControlSettings.ts`
- Define `ControlBindings` type with `p1` and `p2` keyboard maps + gamepad button indices
- `loadBindings()` — reads from `localStorage("controlSettings")`, falls back to defaults
- `saveBindings(bindings)` — writes to localStorage
- Export defaults as constants for reference

### 2. New file: `src/components/ControlSettings.tsx`
- Fullscreen overlay (same style as changelog overlay — black bg, border, monospace)
- Two sections: **Keyboard** (P1 + P2 side by side) and **Gamepad** (display-only Xbox layout reference)
- Each keyboard action row: label + an input field showing current key. Clicking it enters "listening" mode (shows "PRESS KEY..."), captures next keydown as new binding
- "SAVE" button at bottom. On save: writes to localStorage, calls `onSave` callback, shows "Settings saved to localStorage" toast via sonner
- "CANCEL" button to close without saving

### 3. Changes to `src/pages/Game.tsx`

**State & loading:**
- Import `loadBindings` and use it to initialize a `controlBindingsRef`
- On mount and after settings save, reload bindings into the ref

**Key mapping replacement** — all hardcoded key checks replaced with binding lookups:
- Solo mode (~line 1668-1674): `keysRef.current[bindings.p1.left]` instead of `keysRef.current["ArrowLeft"]`
- Solo fire/hyperspace (~line 3198-3206): same pattern
- Duel mode (~line 1402-1412): P1 uses `bindings.p1.*`, P2 uses `bindings.p2.*`
- Online mode (~line 2791-2812): same P1 bindings
- `handleCanvasKeyDown` preventDefault list (~line 3178-3195): dynamically built from current bindings
- Gamepad `readGamepad` (~line 784): use gamepad button indices from bindings

**Control instructions text** (~line 3574-3577):
- Dynamically render key names from current bindings instead of hardcoded "Arrow Keys + Space + Ctrl"

**Menu:** Add a "⚙ SETTINGS" button below the ONLINE button (~line 3419), opens the settings overlay via `showSettings` state.

### 4. Key display helper
- Utility function `displayKeyName(key)` that maps code strings to friendly labels: `"ArrowLeft"` → `"←"`, `"ArrowRight"` → `"→"`, `"ArrowUp"` → `"↑"`, `" "` → `"Space"`, `"Control"` → `"Ctrl"`, etc.

## File summary
- **Create**: `src/hooks/useControlSettings.ts`, `src/components/ControlSettings.tsx`
- **Edit**: `src/pages/Game.tsx` (import bindings, replace hardcoded keys, add settings button + overlay, dynamic control instructions)

