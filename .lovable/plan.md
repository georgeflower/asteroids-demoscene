

# Hall of Fame + Score Table Reset

## Database Changes

1. **Create `current_high_scores` table** — same schema as `high_scores` (id, initials, score, created_at). Same RLS policies (public insert with validation, public select). This becomes the active scoreboard.

2. **Rename usage**: `high_scores` becomes the "old/archive" table. `current_high_scores` is used for new score submissions and the main "TOP SCORES" display.

## UI Changes (all in `src/pages/Game.tsx`)

### Main Menu — Hall of Fame section
Below the existing TOP SCORES area, add a "★ HALL OF FAME ★" section showing the top 3 from the **old** `high_scores` table. For initials "LW", wrap in a link to `https://scenestream.net/demovibes/user/LittleWhite/`. For "MBD", link to `https://scenestream.net/demovibes/user/mirrorbird/`.

### Main Menu — Links
- "VIEW ALL SCORES ▸" opens the current scores overlay (from `current_high_scores`)
- Add "OLD HIGHSCORES ▸" link below it, same style, opens a separate overlay showing top 30 from `high_scores` with a scrollable list

### Data flow changes
- `loadLeaderboard` → query `current_high_scores` (limit 10, for main menu top 3 + in-game top score)
- `saveToLeaderboard` → insert into `current_high_scores`
- New `loadOldLeaderboard` → query `high_scores` (limit 30)
- New `loadHallOfFame` → query `high_scores` (limit 3)
- New state: `oldLeaderboard`, `hallOfFame`, `showOldLeaderboard`

### Old Highscores overlay
Same design as current full leaderboard overlay but with top 30 entries. Uses `max-h-[80vh] overflow-auto` for scrollability on both mobile and desktop.

## Summary of sections in main menu (top to bottom)
1. ★ TOP SCORES ★ (top 3 from `current_high_scores`)
2. VIEW ALL SCORES ▸
3. OLD HIGHSCORES ▸
4. ★ HALL OF FAME ★ (top 3 from `high_scores`, with links for LW and MBD)

