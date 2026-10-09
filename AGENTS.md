# Architecture Rules

- Keep solo enemy entry warnings in the solo state's pending-spawn queue, counted by the spawn director and wave-completion check, so warning countdowns follow simulation pauses without affecting multiplayer.
- Keep changelog copy in `src/data/changelog.ts` and render it through a dedicated overlay component so release content stays readable and presentation remains isolated from game logic.
- Scores are season-scoped: the database stamps `season` on insert from the current `seasons` row; the client never sends it, and season 1 keeps the legacy localStorage keys so no local records are lost.
