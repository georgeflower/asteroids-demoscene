export interface ChangelogSection { label: string; items: string[] }
export interface ChangelogRelease { version: string; date: string; title?: string; sections: ChangelogSection[] }

export const COMING_NEXT: ChangelogSection[] = [
  { label: "Balance", items: [
    "Fewer extra lives: later, rarer and capped",
    "Fewer, fairer enemies; new types arrive later",
    "Green aliens: slower, shorter range, less precise, with a warning before they fire",
    "Blue teleporters: rarer, never land on you, a marker shows where they will appear",
    "Fix: the green spawn cooldown announced in 0.3.1 was never applied; it will finally work",
  ] },
  { label: "Feel & polish", items: [
    "Screen shake and hit-stop (reduced-motion safe)",
    "Wave-clear pause with a bonus tally",
    "SFX mute and a hyperspace cooldown on the touch button",
  ] },
];

export const CHANGELOG: ChangelogRelease[] = [
  { version: "0.4.0", date: "2026-10-04", title: "Reliable cloud saves & admin review", sections: [
    { label: "Added", items: ["Cloud-save status on Game Over, with TAP TO RETRY CLOUD SAVE", "Admin Monitor: rejected submissions table with APPROVE"] },
    { label: "Changed", items: ["Automatic retries when starting a session and when submitting; a final heartbeat is sent when the run ends", "If the server already holds your score (lost response) the game shows SAVED instead of an error", "No server session: the run is saved locally and no retry is offered"] },
    { label: "Fixed", items: ["False \"CLOUD SAVE FAILED: MAX_SUBMISSI\" after a lost response", "A retry button that could never succeed without a session token"] },
  ] },
  { version: "0.3.7", date: "2026-10-04", title: "Main menu & persistent radio", sections: [
    { label: "Changed", items: ["Redesigned main menu with a score card and compact radio player", "Dialogs close with Escape; DUEL is hidden on devices without a keyboard or mouse"] },
    { label: "Fixed", items: ["Radio no longer restarts between menu and game", "In-game radio button could get stuck on pause", "Enter on a focused menu control no longer starts SOLO"] },
  ] },
  { version: "0.3.6", date: "2026-10-04", title: "Mobile layout & touch controls", sections: [
    { label: "Changed", items: ["Compact touch controls with a separate HYPERSPACE button", "Two-tap quit and a pause button for touch", "Desktop hints as two centred lines; FPS overlay is debug-only"] },
    { label: "Fixed", items: ["HUD clipped on phone screens; layout shifts while playing"] },
  ] },
  { version: "0.3.5", date: "2026-10-03", title: "Anti-cheat overhaul", sections: [
    { label: "Changed", items: ["Score limits based on what is physically possible; legitimate late-wave runs are no longer rejected", "Statistical checks now flag a score for review instead of rejecting it"] },
    { label: "Added", items: ["Rejected submissions are logged with a reason code for admin review"] },
  ] },
  { version: "0.3.4", date: "2026-10-03", title: "Solo UI & Game Over redesign", sections: [
    { label: "Changed", items: ["Game Over screen with a fixed-height layout, run summary and cloud status row"] },
    { label: "Fixed", items: ["Score bar layout shift in the solo HUD", "Restored a missing leaderboard entry (QUM)"] },
  ] },
  { version: "0.3.3", date: "2026-09-02", title: "Combo chain, run summary & HUD", sections: [
    { label: "Added", items: ["Combo chain: kills within 2 s build a multiplier (+10% per link, up to x5)", "Run summary with personal best, and a NEXT 1UP counter"] },
    { label: "Changed", items: ["Extra lives are now awarded for every kind of kill, not only asteroids"] },
  ] },
  { version: "0.3.2", date: "2026-08-27", title: "Restart flow & input hardening", sections: [
    { label: "Added", items: ["Instant restart and remembered initials", "Minimum score of 1,000 before initials are asked"] },
    { label: "Changed", items: ["Initials no longer block anything; the cloud save runs in the background"] },
    { label: "Fixed", items: ["Touch controls in online duel", "Audio resumes after the browser suspends it", "Window blur and tab visibility handling", "Arrow keys and WASD no longer scroll the page while the game is focused"] },
  ] },
  { version: "0.3.1", date: "2026-04-13", sections: [
    { label: "Added", items: ["Submission loading state: \"SUBMITTING...\" indicator during cloud score submission", "Dual leaderboard: both cloud and local high scores shown on main menu and game-over screen", "Cloud qualification check for top-10 eligibility"] },
    { label: "Changed", items: ["Green enemy nerf: +300-tick spawn cooldown and ~20° aim spread for reduced accuracy", "Error messaging: clearer feedback on submission failures"] },
    { label: "Fixed", items: ["PLAY AGAIN / MENU buttons locked during initials entry and score submission", "Manual score restoration for missing entries"] },
  ] },
  { version: "0.3.0", date: "2026-03-31", sections: [
    { label: "Added", items: ["Online Co-op Mode: play cooperatively with friends via room codes (host-authoritative)", "Online Lobby: room creation, join, and player list with real-time presence", "Lobby Chat: text chat in the online lobby", "20-second restart countdown timer in co-op", "Late-joiner spectator mode: join mid-game and watch until next round", "Buy Me a Coffee link on main menu"] },
    { label: "Changed", items: ["Global highscores temporarily disabled (local scores still tracked)", "Improved network lag handling and ping display", "Co-op restart: worker re-attachment fix prevents blinking ships / missing asteroids"] },
    { label: "Fixed", items: ["Keyboard state persistence across game restarts", "Late joiners no longer stuck in lobby"] },
  ] },
  { version: "0.2.1", date: "2026-03-24", sections: [
    { label: "Fixed", items: ["Keyboard State Persistence: Fixed bug where keyboard state from previous game persisted into new games, causing ships to automatically move without key input"] },
  ] },
  { version: "0.2.0", date: "2026-03-16", sections: [
    { label: "Changed", items: ["Removed extra life cap per wave — lives can now be earned without limit", "Settings: removed gamepad section, added Turn Speed slider (persisted to localStorage)"] },
  ] },
  { version: "0.1.8", date: "2026-03-15", sections: [
    { label: "Added", items: ["Boss Cycle: Amiga Ball (Lv5), Flying Saucer (Lv10), Tentacle (Lv15), Borg Cube (Lv20)", "New Enemies: Blue Sentinels (wave 8+), Purple Swarms (wave 12+)", "Auto version check on main menu", "Security: database-backed sessions, server-side time validation"] },
  ] },
  { version: "0.1.7", date: "2026-03-13", sections: [
    { label: "Added", items: ["Rebindable keyboard controls for both players (saved to localStorage)", "Settings overlay accessible from pause menu"] },
  ] },
  { version: "0.1.6", date: "2026-03-13", sections: [
    { label: "Gameplay", items: ["Difficulty Scaling: Speed now starts at 100% on wave 1 with +5% per level (was 110% base + 3%/wave)"] },
  ] },
  { version: "0.1.5", date: "2026-03-13", sections: [
    { label: "Performance", items: ["Eliminated ~85 shadowBlur calls/frame (down to 2)", "CRT scanlines pre-rendered to offscreen canvas", "Gradient caching for vignette, marquee, backdrop", "Delta-time game loop: fixed-timestep accumulation, 60 FPS cap, 250ms spiral-of-death prevention"] },
    { label: "Added", items: ["Hall of Fame: top 3 all-time scores on main menu", "Old Highscores: scrollable top 30 archive overlay", "Highscore Reset: fresh active scoreboard"] },
  ] },
  { version: "0.1.0", date: "Initial Release", sections: [
    { label: "Initial release", items: ["Solo mode with wave-based progression", "Duel mode for local 2-player gameplay", "Online multiplayer mode", "Color themes rotating every 5 waves", "Keyboard and gamepad support", "Power-ups, boss fights, UFOs, aliens", "Leaderboard system & CRT effects", "Nectarine Demoscene Radio integration"] },
  ] },
];
