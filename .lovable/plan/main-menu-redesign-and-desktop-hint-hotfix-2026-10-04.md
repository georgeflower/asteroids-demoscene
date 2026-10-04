# Main menu redesign and desktop hint hotfix

## Scope
Update only `src/pages/Game.tsx`. Preserve gameplay, scoring, networking, score loading, settings content, radio behavior, and all in-game layout except the desktop hint rows.

## Changes
- Add a local reusable menu button and shared compact radio player, keeping one hidden audio element in whichever screen is active.
- Detect fine-pointer capability once, hide local DUEL without it, and make menu navigation skip DUEL with a minimal handler adjustment.
- Rebuild the menu as a centered, scroll-safe phone-first column with static vignette and asteroid outlines.
- Consolidate global and local scores into one fixed-height tabbed card with stable loading and empty states.
- Render only the selected full leaderboard, and make leaderboard, archive, and changelog dialogs accessible, Escape-dismissible, and phone-safe.
- Replace mobile keyboard instructions with touch guidance; retain three desktop instruction lines.
- Replace the menu’s native radio controls with the compact player and standardize the footer controls.
- Split each in-game desktop hint group into centered lines without clipping.

## Validation
- Test touch layouts at 390×844 and 360×640, including hidden DUEL, stable score-card dimensions, radio controls, and scrolling.
- Test desktop at 1280×800 for equal button sizing, selection stability, keyboard navigation, and unclipped in-game hints.
- Verify one leaderboard dialog at a time, Escape and close controls, persisted AUTO state, no native audio controls, and no SupaExplorer references.
- Confirm no new console errors and a clean build.

## Assumption
The global score tab remains selected while its initial request is pending; after loading completes, the initial choice falls back to local only when the global board is empty.
