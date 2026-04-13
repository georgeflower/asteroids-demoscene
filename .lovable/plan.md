

# Fix: PLAY AGAIN button bypasses score submission

## Root Cause

The "PLAY AGAIN" and "MENU" buttons (lines 6282-6304) are always visible on the game-over screen, even while the initials entry form is open. A player can type their initials, see the form, but accidentally (or intentionally) click "PLAY AGAIN" — which calls `initGame()` and resets all state including `setEnteringInitials(false)`, completely skipping the cloud leaderboard submission.

This is exactly what happened: the session `c617c92f` has `submission_count: 0` and `expired: false` — no `/submit` call was ever made, even though heartbeats were correctly recorded (last_score: 54,890, level 7).

## Fix

Disable the "PLAY AGAIN" and "MENU" buttons while `enteringInitials` is true OR `submittingScore` is true. This forces the player to complete the initials submission flow before restarting.

**File**: `src/pages/Game.tsx` (lines 6282-6304)

```typescript
// Add disabled prop and styling to both buttons
<Button
  onClick={initGame}
  disabled={enteringInitials || submittingScore}
  className={`text-xl px-8 py-4 font-mono transition-all ${
    enteringInitials || submittingScore ? "opacity-30 cursor-not-allowed" : ""
  } ${gameOverSelection === 0 ? "..." : "..."}`}
>
  ...PLAY AGAIN
</Button>
<Button
  onClick={quitToMenu}
  disabled={enteringInitials || submittingScore}
  className={`font-mono transition-all ${
    enteringInitials || submittingScore ? "opacity-30 cursor-not-allowed" : ""
  } ${gameOverSelection === 1 ? "..." : "..."}`}
>
  ...MENU
</Button>
```

Also gate the gamepad "A" button restart (line 5460) with the same check — already gated by `!enteringInitialsRef.current`, but add `submittingScore` guard too.

## Also: Insert QUM's score manually

The session shows last_score of 54,890. Insert this score for initials "QUM" into `current_high_scores` with a corresponding audit log entry marked as `manual`.

