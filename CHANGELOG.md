# Changelog

All notable changes to this project will be documented in this file.

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