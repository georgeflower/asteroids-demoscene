

# Plan: Delete ZOI Score & Add Entropy + Corrected Score Bounds Validation

## Summary

Delete the recurring ZOI fake score, then add entropy-based detection and corrected per-level score bounds that account for **all** scoring sources: asteroids, UFOs, aliens, bosses, mini-cubes, and the 2x score multiplier power-up.

## Complete Scoring Model

| Source | Points | With 2x Multiplier |
|--------|--------|---------------------|
| Large asteroid | 20 | 40 |
| Medium asteroid | 50 | 100 |
| Small asteroid | 100 | 200 |
| Full large chain (1L→2M→4S) | 520 (7 kills) | 1,040 |
| Large UFO | 200 | 400 |
| Small UFO | 1,000 | 2,000 |
| Brown alien | 300 | 600 |
| GreenMan alien | 500 | 1,000 |
| BlueSentinel alien (Wave 8+) | 600 | 1,200 |
| PurpleSwarm alien (Wave 12+) | 100 | 200 |
| Mini-cube (Borg boss) | 25 | 25 (no multiplier applied) |
| Mini-saucer (Flying Saucer boss) | 200 | 400 |
| Boss kill | 2000 + wave×200 | (2000 + wave×200) × 2 |

### Asteroid count per wave
- `min(4 + wave*2, 20)` large asteroids per wave (caps at wave 8+)
- Each large = 7 kills = 520 pts base

### Per-wave theoretical max (generous estimate)
Includes asteroids + UFOs (2 per wave est.) + aliens (4 per wave est.) + boss every 5th wave. With 2x multiplier active:

```text
Wave 1:  6 large → 6,240 + UFOs 4,000 + aliens 2,400 = ~12,640
Wave 2:  8 large → 8,320 + extras ≈ ~15,000
Wave 5:  14 large + boss → 14,560 + 6,400 boss + extras ≈ ~28,000
Wave 8+: 20 large → 20,800 + extras ≈ ~32,000
Wave 10: 20 large + boss → 20,800 + 8,800 boss + extras ≈ ~40,000
```

Using a generous **50,000 pts/level cumulative cap** (up from current 75,000 which is already generous) would still catch the ZOI pattern (25,000 at Level 1 is impossible even with multiplier).

Actually, current `MAX_SCORE_PER_LEVEL = 75,000` is fine — the issue is the attacker stays on Level 1 with 25k+ which exceeds even generous bounds. The existing check works if enforced correctly. The real gap is **entropy**.

## Changes

### 1. Delete ZOI score (data operation)
Delete from `current_high_scores`, `score_audit_log`, and `game_session_checkpoints` for session `5c4010bb-d651-4a0c-9639-d310aa3679d2`.

### 2. Add entropy validation to edge function

In `supabase/functions/submit/index.ts`, after existing checkpoint validation:

- **Score delta coefficient of variation (CV)**: Calculate standard deviation / mean of score increments between consecutive checkpoints. Real gameplay has high variance (different asteroid sizes, UFOs worth 1000, aliens worth 100-600, bosses worth 2000+, multiplier toggling). If CV < 0.15 with 5+ checkpoints, hard-reject — the ZOI session had CV ≈ 0.001.

- **Pts-per-asteroid ratio variance**: For each checkpoint pair, calculate `scoreDelta / asteroidsDelta`. Real games vary wildly because UFO kills (200-1000 pts, 0 asteroid increment), alien kills (100-600 pts, 0 asteroid increment), boss kills (2000+ pts, 0 asteroid increment), and multiplier (2x) all affect the ratio. If standard deviation of this ratio is < 5 across 5+ checkpoints, reject.

### 3. Tighten level-1 score cap

The current `MAX_SCORE_PER_LEVEL = 75,000` means Level 1 allows 75k — too generous. Add a specific early-level check: if `level == 1` and `score > 15,000`, reject. Wave 1 has only 6 large asteroids; even with 2x multiplier, UFOs, and aliens, 15k is extremely generous for a single wave.

## Files Changed

| File | Change |
|------|--------|
| **Data operation** | Delete ZOI score + audit + checkpoints for session `5c4010bb` |
| `supabase/functions/submit/index.ts` | Add entropy validation (score delta CV, pts/asteroid variance) and tighten level-1 cap |

