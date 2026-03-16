

## Plan: Add Turn Speed Slider to Settings

### What changes

**1. `src/hooks/useControlSettings.ts`** — Add `turnSpeed` field to `ControlBindings` interface with a default of `0.055`. Update `loadBindings` to merge in the default if missing (backward compat with existing localStorage data).

**2. `src/components/ControlSettings.tsx`** — Add a "TURN SPEED" slider section (between the gamepad section and buttons). Use an HTML `<input type="range">` styled to match the retro theme. Range: `0.02` (slow) to `0.10` (fast), step `0.005`, default `0.055`. Display current value as a label. Reset defaults also resets turn speed.

**3. `src/pages/Game.tsx`** — In `createShip`, read `controlBindingsRef.current.turnSpeed` instead of hardcoded `0.055`. In `onSave` callback, update the live game state's ship `rotationSpeed` so it takes effect immediately without restarting.

**4. `src/workers/gameWorker.ts`** — Accept a `turnSpeed` parameter in the `init` message and use it for `createShip`'s `rotationSpeed` instead of hardcoded `0.05`. Also accept it in `inputs` messages so it can be changed mid-game.

### Technical details

- The slider will use a native range input styled with Tailwind (no need for the Radix Slider component) to keep it consistent with the retro monospace aesthetic already in the settings panel.
- `turnSpeed` is stored alongside the existing control bindings in localStorage under the same `controlSettings` key.
- Both the single-player game loop (Game.tsx) and the multiplayer worker (gameWorker.ts) will respect the setting.

