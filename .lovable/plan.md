

# Fix: Increase Score Plausibility Cap

## Problem

`MAX_SCORE_PER_SECOND = 150` in `supabase/functions/submit/index.ts` is too low. A legitimate player on wave 8 scored 109,400 in ~600s (~183 pts/sec). With score multipliers, boss bonuses, and dense enemy waves at higher levels, 150/sec is easily exceeded.

## Plan

1. **Increase `MAX_SCORE_PER_SECOND`** from `150` to `300` in `supabase/functions/submit/index.ts`. This accommodates multiplier power-ups (2x scoring), boss kill bonuses, and dense late-game waves while still catching obvious cheats.

2. **Increase `MAX_SCORE_PER_LEVEL`** from `20000` to `40000` — same reasoning; higher waves with multipliers can exceed 20k per level.

One file changed: `supabase/functions/submit/index.ts` (two constant values).

