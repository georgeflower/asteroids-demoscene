# Changelog

All notable changes to this project will be documented in this file.

## Coming next (planned, not released — subject to change)

### Game balance
- **Fewer extra lives**: later and rarer 1UPs, a cap on total lives, and no extra-life drops from plain asteroids
- **Fewer, fairer enemies**: new enemy types arrive later, fewer are alive at once, and spawns have more breathing room
- **Green aliens**: slower, shorter-range and less precise shots, with a visible warning just before they fire
- **Blue teleporters**: teleport less often, never land on top of you, and show a marker where they will appear
- **Fix**: the green-enemy spawn cooldown announced in 0.3.1 was never actually applied (a timer was overwritten) and will finally take effect

### Game feel
- Screen shake and a brief hit-stop on big impacts (respects reduced-motion settings)
- A short wave-clear pause with a bonus tally

### Polish
- Sound-effects mute / volume control
- Hyperspace cooldown indicator on the touch button
- Accessibility labels for all buttons

### Under consideration
- Landscape layout for phones
- Difficulty-curve tuning based on in-game telemetry
- Splitting the rendering code out of `Game.tsx`

## [0.4.0] - 2026-10-04 — Reliable cloud saves & admin review

### Added

- **Cloud-save status** on the Game Over screen: SAVING / SAVED / SAVED LOCALLY / CLOUD SAVE FAILED with a short reason code
- **TAP TO RETRY CLOUD SAVE** button after a failed save
- **Admin Monitor**: REJECTED SUBMISSIONS table (reason code, score, wave, details) with an APPROVE action to add a legitimate run to the board

### Changed

- The game session now starts with automatic retries, and a final heartbeat is sent when the run ends so the last score is on record
- Score submission retries on network errors and server errors; the proof-of-work wait is bounded and reports `POW` if it times out
- If the server already holds your score (for example the response was lost), the game recognises it and shows SAVED instead of an error
- If no server session could be started, the run is saved locally and no retry is offered

### Fixed

- False "CLOUD SAVE FAILED: MAX_SUBMISSI" after a lost response
- A retry button that could never succeed without a session token

## [0.3.7] - 2026-10-04 — Main menu & persistent radio

### Changed

- **Main menu redesign**: clear button list, GLOBAL / LOCAL score card, control hints, compact radio player and tidy footer
- Changelog, All Scores and Settings open as proper dialogs, closable with Escape
- DUEL is only offered on devices with a keyboard or mouse (no more flash on phones)

### Fixed

- Radio music no longer restarts when switching between menu and game (one persistent audio element)
- The in-game radio play/pause button could get stuck on pause
- Pressing Enter on a focused menu control (CHANGELOG, tabs, radio) no longer starts SOLO instead

## [0.3.6] - 2026-10-04 — Mobile layout & touch controls

### Changed

- Compact in-game radio mini-player and a pause button for touch devices
- Larger, clearer touch controls (rotate, thrust, fire) with a separate HYPERSPACE button; touch targets are at least 44 px
- Two-tap "main menu" quit while playing
- Desktop control hints shown as two centred lines
- FPS overlay is now debug-mode only

### Fixed

- HUD clipped on phone screens; the layout no longer shifts while playing

## [0.3.5] - 2026-10-03 — Anti-cheat overhaul

### Changed

- Score limits are now based on what is physically possible (hard ceiling of 10,000 points per second plus a 100,000 burst allowance for boss kills); the old heartbeat cap wrongly rejected legitimate late-wave runs
- Statistical checks now only flag a score for admin review instead of rejecting it
- Heartbeats: minimum 5 s gap, at most 6 per minute, strictly increasing sequence numbers; one atomic submission per session

### Added

- Rejected submissions are logged with a reason code and details (`rejected_submissions`) for admin review

### Fixed

- Legitimate high scores being rejected as impossible

## [0.3.4] - 2026-10-03 — Solo UI & Game Over redesign

### Changed

- **Redesigned Game Over screen**: fixed-height layout that no longer jumps, run summary, initials entry, cloud status row and PLAY AGAIN / MENU; full-screen on phones
- Solo-mode UI fixes

### Fixed

- Score bar layout shift in the solo HUD
- Restored a missing leaderboard entry (QUM)

## [0.3.3] - 2026-09-02 — Combo chain, run summary & HUD

### Added

- **Combo chain**: kills within 2 seconds of each other build a score multiplier (+10% per link, up to ×5) with an on-canvas indicator and decay bar; it resets when you lose a life
- **Run summary** on the Game Over screen: time, wave, accuracy, asteroids, best chain and personal best
- **NEXT 1UP** counter in the HUD

### Changed

- Extra lives (every 10,000 points) are now awarded for every kind of kill, not only asteroids

### Fixed

- Game Over keyboard and gamepad selection (Enter / Space / A) made reliable

## [0.3.2] - 2026-08-27 — Restart flow & input hardening

### Added

- **Instant restart**: PLAY AGAIN and MENU are never locked; Enter / Space activate them on Game Over
- **Remembered initials**: pre-filled from your last entry
- A minimum score of 1,000 is required before you are asked for initials

### Changed

- Initials entry no longer blocks anything: the local score is saved instantly and the cloud save runs in the background

### Fixed

- Touch controls in online duel
- Audio resumes after the browser suspends it
- Handling of window blur and tab visibility changes
- **Arrow Key Scrolling**: Arrow keys (Up, Down, Left, Right) and WASD keys no longer scroll the browser page while the game canvas is focused, including during active gameplay and when the pause menu is open. Normal browser scrolling is restored when the game no longer has focus (for example, after clicking outside the canvas or switching tabs).

## [0.3.1] - 2026-04-13

### Added

- **Submission Loading State**: "SUBMITTING..." indicator shown while score is being saved to the cloud leaderboard
- **Dual Leaderboard Display**: Main menu now shows both cloud leaderboard and local high scores simultaneously when cloud is enabled
- **Cloud Qualification Check**: Initials prompt now triggers for top-10 cloud leaderboard eligibility, not just local high scores

### Changed

- **Green Enemy Spawn Cooldown**: Green enemies now have an additional 300-tick cooldown between spawns, making them appear less frequently
- **Green Enemy Aim Accuracy**: Green enemy projectiles now have ~20° angular spread, reducing perfect-aim difficulty by ~10%
- **Error Messaging**: Score submission errors now display "Error logged — the developer has been notified" instead of generic messages

### Fixed

- **Score Submission Bypass**: PLAY AGAIN and MENU buttons (and gamepad restart) are now disabled while entering initials or submitting a score, preventing accidental bypass of cloud leaderboard submission
- **Missing Scores Restored**: Manually inserted scores for QUM (54,890) and MBD (81,360) that were lost due to the submission bypass bug

## [0.3.0] - 2026-03-31

### Added

- **Online Co-op Mode**: Cooperative multiplayer via room codes with host-authoritative game state broadcast over Realtime
- **Online Lobby**: Room creation, joining, and real-time player list with presence tracking
- **Lobby Chat**: Text chat in the online lobby for pre-game coordination
- **20-Second Restart Countdown**: After game over in co-op, host triggers a 20s timer visible to all players before the next round auto-starts
- **Late-Joiner Spectator Mode**: Players joining a room mid-game automatically enter spectator mode, watching the ongoing session and joining as active players on the next restart
- **Buy Me a Coffee**: Added support link on the main menu

### Changed

- **Global Highscores Disabled**: Global highscore submission temporarily turned off; local scores still tracked
- **Improved Network Performance**: Better lag handling and ping display for online multiplayer

### Fixed

- **Co-op Restart**: Fixed worker `onmessage` handler not re-attaching after restart, causing blinking ships and missing asteroids
- **Late Joiners Stuck in Lobby**: Fixed issue where players joining mid-game never transitioned to spectator mode
- **Keyboard State Persistence**: Fixed bug where keyboard state from the previous game persisted into new games, causing ships to automatically move without key input

## [0.2.1] - 2026-03-24

### Fixed

- **Keyboard State Persistence**: Fixed bug where keyboard state from the previous game persisted into new games, causing ships to automatically move without key input (e.g., thrusting forward as if holding Up key). Now properly clears `keysRef.current` in all game initialization functions (`initGame`, `initDuel`, `initOnline`)

## [0.1.9] - 2026-03-15

### Changed

- **Extra Life Cap Removed**: Extra life power-ups now always grant +1 life with no per-wave cap

## [0.1.8] - 2026-03-15

### Added

- **Enemy Varieties**: Blue Sentinels (wave 8+) with teleporting, 0.5s charge-up visual/sound, burst-fire, and brief invisibility. Purple Swarms (wave 12+) with boids-style flocking behavior
- **Boss Reorder**: Bosses now appear as Amiga Ball (level 5), Flying Saucer (level 10), Tentacle (level 15), Borg Cube (level 20), then cycle
- **Security Hardening**: Database-backed game sessions replacing in-memory tracking, server-side time validation, tightened plausibility checks (max level 30, max score 500k, 150 pts/sec cap), origin header validation

### Fixed

- **Fraudulent Score Removal**: Removed injected "AZZ" high score entry and associated audit logs
- **Cold-Start Exploit**: Eliminated vulnerability where edge function cold starts allowed forged session data

## [0.1.7] - 2026-03-13

### Added

- **Rebindable Controls**: Key bindings for both players can now be customized via the Settings overlay; bindings persist in localStorage
- **Pause Menu Settings**: Settings overlay now accessible from the pause menu (previously only available from the main menu)

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
