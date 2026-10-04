# Compact in-game radio and touch controls

## Scope
Update only `src/pages/Game.tsx`. Preserve the canvas, HUD, gameplay handlers, radio autoplay behavior, pause overlay, and all game logic.

## Changes
- Remove the SupaExplorer badge from the in-game screen.
- Replace the in-game native radio controls and checkbox with one fixed-height mini-player row using accessible play/pause, AUTO, and touch-only pause controls.
- Keep the existing hidden audio element, source, event handlers, persistence, and autoplay retry behavior.
- Anchor the in-game layout to the top on touch devices while retaining desktop centering; reserve stable space below the canvas.
- Restyle the existing touch controls without changing their touch handlers, keys, shooting, hyperspace, or multi-touch behavior.
- Increase desktop hint legibility and hide hints on touch devices.
- Add a three-second, two-tap confirmation to the small main-menu control.
- Keep the debug trainer control isolated below the mini-player and absent in production.

## Validation
- Check the source contains no SupaExplorer reference.
- Exercise play/pause, AUTO persistence, pause, long-press prevention, and two-tap quit behavior.
- Compare canvas bounds across dynamic radio states.
- Test touch layouts at 360×640 and 390×844, plus desktop centering.
- Confirm no page scroll, no new console errors, and a clean build.

## Assumption
The main-menu radio remains unchanged because it shares the single audio element and replacing it would expand beyond the requested in-game scope.
