

# Fix: Settings overlay not rendering from pause menu

## Problem
The `{showSettings && <ControlSettings />}` block (line 3603) is only inside the `gameMode === "menu"` return branch. When the game is running and paused, the main game return block (starting at line 3751) is used instead, which has no settings overlay rendering.

## Solution
Add the same settings overlay rendering inside the main game return block (after the pause overlay, around line 4020), so it appears when `showSettings` is true regardless of which screen is active. The existing one in the menu block can stay as-is.

### Changes in `src/pages/Game.tsx`
Add after the pause overlay closing `</div>` (around line 4020):

```tsx
{showSettings && (
  <ControlSettings
    bindings={controlBindingsRef.current}
    onSave={(newBindings) => {
      controlBindingsRef.current = newBindings;
      setShowSettings(false);
    }}
    onClose={() => setShowSettings(false)}
  />
)}
```

This is a single insertion. The `ControlSettings` component already uses `fixed inset-0 z-50` so it will render on top of the pause overlay (`z-10`).

