# Changelog

All notable changes to this project will be documented in this file.

## [0.1.7] - 2026-03-13

### Fixed

- **Pause Menu Settings**: Settings overlay now opens correctly from the pause menu; previously it was only rendered in the main menu branch
- **Pause State Preserved**: Opening settings from the pause menu no longer unpauses the game in the background

## [0.1.6] - 2026-03-13

### Gameplay

- **Extra Life Cap**: Maximum extra lives earned per level now capped — 1 per level on waves 1-3, 2 per level on waves 4-6, 3 per level from wave 7 onward
- **Difficulty Scaling**: Speed now starts at 100% on wave 1 and increases by 5% per level (previously 110% base with 3% per wave)

### Added

- **In-Game Changelog**: Changelog now opens as an in-game overlay with monospace font instead of linking to GitHub; closeable with a "Back to Menu" button

## [0.1.5] - 2026-03-13

### Performance

- **Shadow Rendering**: Eliminated ~85 `shadowBlur` calls per frame, reducing to only 2 (ship only). Removed double-stroke glow passes from all game objects
- **CRT Scanlines**: Pre-rendered scanline pattern to offscreen canvas; single `drawImage` call replaces ~150 individual `fillRect` calls per frame
- **Gradient Caching**: Vignette, marquee, and backdrop gradients now created once (on resize) and reused each frame instead of being reallocated 60×/sec
- **Marquee Scanline Cleanup**: Removed redundant scanline sub-loops from Now Playing and oneliner sections
- **Delta-Time Game Loop**: Implemented fixed-timestep update loop with delta-time accumulation, 60 FPS render cap with 1 ms jitter tolerance, and a 250 ms cap to prevent spiral-of-death after tab switches or pauses — ensures consistent game speed regardless of frame rate

### Added

- **Hall of Fame**: Top 3 all-time scores displayed on the main menu from the archived highscore table, with clickable links for LW (LittleWhite) and MBD (mirrorbird) to their SceneStream profiles
- **Old Highscores**: Scrollable overlay showing the top 30 archived scores, accessible via "OLD HIGHSCORES ▸" link on the main menu
- **Highscore Reset**: New active scoreboard (`current_high_scores`) for fresh competition; previous scores preserved in the archive

### Changed

- **Top Scores**: Main menu "TOP SCORES" and "VIEW ALL SCORES" now display scores from the new active table
- **Score Saving**: New scores are saved to the fresh scoreboard

## [Unreleased]

### Fixed

- **Arrow Key Scrolling**: Arrow keys (Up, Down, Left, Right) and WASD keys no longer scroll the browser page while the game canvas is focused, including during active gameplay and when the pause menu is open. Normal browser scrolling is restored when the game no longer has focus (for example, after clicking outside the canvas or switching tabs).

## 🚀 v0.1.4 — UI/UX Polish & HUD Improvements

## Summary Table

| Category | Changes                                                           |
| -------- | ----------------------------------------------------------------- |
| UI/UX    | New hyperspace indicator, compact controls, HUD version placement |
| Marquee  | GIF replacements, 5‑message separator, country flags              |
| Audio    | autoPlayMusic now defaults to false                               |
| Branding | Title links to scenestream.net                                    |

## **Hyperspace Charge Indicator**

- Added circular **SVG progress indicator** using the uploaded logo
- Greyscale while charging
- Full‑color + **pulse animation** when ready
- Plays **powerUp** sound on full charge
- Removed all hyperspace‑related toast notifications

## **Controls Layout**

- Keyboard/gamepad controls condensed into a **single-line row** across the canvas
- Reduces vertical space usage and improves clarity

## **Marquee & Oneliner Enhancements**

- Replaced text tokens with inline animated GIFs:
  - `:necta:`
  - `:nectawall:`
  - `d^^b`
  - `:D`
- Oneliner now shows the **latest 5 messages** separated by `|`
- Added **country flag emoji** before author names (derived from `flag` attribute)

## **Branding Updates**

- "NECTARINE DEMOSCENE RADIO" now links to **scenestream.net**
- Removed "Thanks to…" text below the title

## **HUD & Version Display**

- Version moved to the **HUD**, next to WAVE
- Shown in smaller gray text
- Removed version text from canvas and controls area

## **Audio Defaults**

- `autoPlayMusic` now defaults to **false**

## [0.1.3] - 2026-03-11

## PR #24 - Fix 11 ESLint errors: type safety and ES module compliance

**Merged:** 2026-03-11 at 07:14:37 UTC  
**Files changed:** 5 files (+31 additions, -11 deletions)

### Fixed

- **ESLint Errors**: Resolved 11 ESLint errors including:
  - Empty interface types converted to type aliases (`@typescript-eslint/no-empty-object-type`)
    - `command.tsx`: Changed `interface CommandDialogProps extends DialogProps {}` to `type CommandDialogProps = DialogProps`
    - `textarea.tsx`: Applied same pattern for `TextareaProps`
  - Eliminated explicit `any` types (`@typescript-eslint/no-explicit-any`)
    - `useMultiplayer.ts`: Added `PresenceInfo` and `PresenceState` interfaces for Supabase presence callbacks
    - `soundEffects.ts`: Added `WindowWithWebkitAudio` interface for webkit AudioContext prefix
  - ES module import compliance (`@typescript-eslint/no-require-imports`)
    - `tailwind.config.ts`: Changed `require("tailwindcss-animate")` to `import tailwindcssAnimate from "tailwindcss-animate"`
  - Safer AudioContext initialization with explicit null check and error throw instead of non-null assertion

---

## PR #26 - Fix high score rank alignment with CSS whitespace preservation

**Merged:** 2026-03-11 at 11:04:17 UTC  
**Fixes:** Issue #25  
**Files changed:** 1 file (+4 additions, -4 deletions)

### Fixed

- **High Score Alignment**: Fixed alignment issue where high score rank 10 didn't align with ranks 1-9 by adding CSS whitespace preservation (`whiteSpace: "pre"`) to rank span elements in:
  - Full leaderboard modal (line 3142)
  - Game over leaderboard (line 3358)
  - Main menu top 3 scores (line 3103)
- Added missing `.padStart(2, " ")` formatting to main menu ranks

## [0.1.2] - 2026-03-10

### Fixed

- **Shield Power-Up Activation**: Fixed issue where Shield power-ups collected during spawn invulnerability were prematurely deactivated when the spawn timer expired
- **Music Player Auto-Resume**: Fixed music player automatically resuming after being paused when transitioning between game modes or starting a game
- **Pause Music State**: AUTO-PLAY MUSIC checkbox now properly unchecks when pausing the game and remains unchecked until manually re-enabled

## [0.1.1] - 2026-03-10

### Changed

- **Hyperspace Control**: Changed hyperspace key from `H` to `Left Ctrl` or `Right Ctrl` for easier access during gameplay
- **Hyperspace Safety**: Hyperspace now teleports the ship to a safe location away from asteroids, UFOs, aliens, boss, and enemy bullets
- **Hyperspace Cooldown**: Added 10-second cooldown period between hyperspace jumps to prevent abuse
- Removed random 10% death chance from hyperspace jumps

### Fixed

- Improved usability of hyperspace feature by making it accessible without looking at the keyboard

## [0.1.0] - Initial Release

### Added

- Solo mode with wave-based progression
- Duel mode for local 2-player gameplay
- Online multiplayer mode
- Multiple color themes that change every 5 waves
- Keyboard and gamepad support
- Power-ups: Shield, Rapid Fire, Extra Life, Score Multiplier
- Boss fights every 5 waves
- UFO and alien enemies
- Leaderboard system
- CRT screen effects and retro graphics
- Integration with Nectarine Demoscene Radio
