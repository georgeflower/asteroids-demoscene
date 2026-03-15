

# Reorder Boss Cycle

Change the boss order from Tentacle→Amiga Ball→Flying Saucer→Borg Cube to **Amiga Ball→Flying Saucer→Tentacle→Borg Cube**.

Three locations in `src/pages/Game.tsx` need the array reordered:

1. **Line 834-836** (`createBoss`): Change comment and array to `["amigaBall", "flyingSaucer", "tentacle", "borgCube"]`
2. **Line 1212-1213** (boss wave label): Change array to match new order
3. Update comment on line 834 to reflect `5=amigaBall, 10=flyingSaucer, 15=tentacle, 20=borgCube`

No other changes needed — all boss logic is keyed on `bossType` string, not wave number.

