

# Implementation Plan: 9 Game UI/UX Changes

This plan covers all 9 requested changes to the Asteroids Demoscene game.

## Changes Summary

1. **Remove toast notifications, add hyperspace charge icon** — Replace all `toast.*()` calls with nothing (or the new icon indicator). Add a circular progress indicator around the hyperspace logo image that fills clockwise. While charging: greyscale + dimmed icon. When full: color returns with glimmer animation + subtle sound.

2. **Compact controls layout** — Make keyboard/gamepad controls use less vertical space, span the full canvas width in a single horizontal row.

3. **Remove artist/song text above audio player** — Remove the `nowPlaying` text shown outside the canvas (lines ~3676-3681 and ~3183-3189), since it's already in the canvas marquee.

4. **Don't auto-play radio by default** — Change default `autoPlayMusic` from `true` to `false`.

5. **Remove "Thanks to..." text, make title a link** — Remove the thanks text (lines ~3718-3736 and ~3225-3239). Make "NECTARINE DEMOSCENE RADIO" title a clickable link to `https://scenestream.net/demovibes/`.

6. **Replace emoticon codes with animated GIFs in oneliner marquee** — Copy the 4 uploaded GIFs to `public/images/`. In the canvas draw code for the oneliner marquee, parse the message text for `:necta:`, `:nectawall:`, `d^^b`, `:D` and draw the corresponding image inline at the text position. Preload the images as `HTMLImageElement`.

7. **Show country flag emoji for author** — Parse the `flag` attribute from the oneliner XML entries (e.g., `FR`, `SE`, `de`). Convert the 2-letter country code to a flag emoji using regional indicator symbols. Prepend the flag to the author name in the marquee.

8. **Show latest 5 messages with separator** — Change the oneliner fetch to store the 5 most recent entries (not just 1). Concatenate them with `          |          ` separator. Display as one long scrolling string.

9. **Move version next to WAVE in HUD** — Remove the version from below the controls area and from the canvas top-right. Add it to the HTML HUD bar next to WAVE, same font but gray and smaller.

---

## Technical Details

### Files Modified
- **`src/pages/Game.tsx`** — All changes are in this single file.
- **4 GIF files** copied to `public/images/` from uploads.

### Task 1: Hyperspace Charge Icon
- Copy `hyperspace.png` to `src/assets/hyperspace.png`.
- Remove all `toast.*()` calls throughout the file (~10 occurrences).
- Remove `import { toast } from "sonner"`.
- Add state for hyperspace charge progress (derived from `gameStateRef.current.ship.hyperspaceCooldown`).
- Render a small HUD element (HTML overlay or drawn on canvas) near the HUD bar: a circular SVG/canvas element with the hyperspace logo centered, a 5px circular border that fills clockwise based on charge (0-600 frames = 0-100%). While charging: apply CSS `grayscale(1) opacity(0.5)`. When full: remove filter, add a brief glimmer CSS animation, play `soundEffects.powerUp()` once.
- Implementation: Add an HTML element positioned above the canvas, showing the icon with an SVG circle stroke-dasharray for the circular progress. Update via a new `displayHyperCharge` state updated in the game loop.

### Task 2: Compact Controls
- Change the controls section (lines ~3616-3669) from two-column vertical layout to a single horizontal row using flex with smaller text, fitting the canvas width.

### Task 3: Remove nowPlaying text outside canvas
- Remove the `{nowPlaying && ...}` blocks at lines ~3676-3681 (game view) and ~3183-3189 (menu view).

### Task 4: Default autoPlayMusic to false
- Line 263: Change `stored === null ? true : stored === "true"` to `stored === "true"`.
- Remove the eager autoplay useEffect (lines ~2596-2621) or gate it properly.

### Task 5: Link title, remove thanks
- Make the "NECTARINE DEMOSCENE RADIO" text an `<a>` tag linking to the scenestream URL.
- Remove "Thanks to..." and "Streaming demoscene..." text blocks.

### Task 6: Animated GIFs in Canvas Marquee
- Copy GIFs to `public/images/necta.gif`, `nectawall.gif`, `headphones.gif`, `D.gif`.
- Preload as `Image` objects in a useEffect.
- In the oneliner marquee draw code, split the message by the emoji codes, measure text widths, and `drawImage` for the GIF segments at matching positions. Canvas doesn't animate GIFs natively, so we'll re-render them each frame (they'll show frame 1 only). For true animation, we'd need to decode GIF frames — but the canvas redraws at 60fps and browsers may update the image source. A practical approach: use `<img>` elements off-screen and draw them — some browsers animate them on canvas, others don't. We'll try the simple approach first.

### Task 7: Country Flags
- Update oneliner fetch to parse `flag` attribute from `<author>` element.
- Convert country code to flag emoji: `code.toUpperCase().split('').map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')`.
- Store flag with each oneliner entry. Prepend flag emoji to author name in marquee text.

### Task 8: 5 Messages with Separator
- Change `onelinerRef` type to store an array of up to 5 entries.
- In fetch, grab first 5 `<entry>` elements instead of just 1.
- In draw, concatenate: `entries.map(e => `[flag author] message`).join('          |          ')`.
- Adjust marquee reset logic for the longer combined text.

### Task 9: Move Version
- Remove version from canvas draw (lines ~2396-2403).
- Remove version from below controls (lines ~3663-3668).
- Add version to the HTML HUD bar next to WAVE: `<div className="text-gray-500 text-[8px]">v{GAME_VERSION}</div>`.

