

# Plan: Insert MBD Score + Add Submission Loading State + Improve Error Message

## 1. Manually insert MBD's score (81,360)

Use the database insert tool to add the score directly to `current_high_scores`, then add a corresponding `score_audit_log` entry marked as `manual`.

```sql
INSERT INTO current_high_scores (initials, score, level, time_played_seconds, source, session_token)
VALUES ('MBD', 81360, 1, 0, 'manual', NULL);

INSERT INTO score_audit_log (score_id, session_token, submission_method)
VALUES ((SELECT id FROM current_high_scores WHERE initials = 'MBD' AND score = 81360 ORDER BY created_at DESC LIMIT 1), NULL, 'manual');
```

## 2. Add loading state during score submission

Add a `submittingScore` state variable. Set it `true` before calling `saveToLeaderboard`, `false` after. While submitting:
- Disable the input and OK button
- Show "SUBMITTING..." text replacing or beside the OK button

**File**: `src/pages/Game.tsx`
- Add `const [submittingScore, setSubmittingScore] = useState(false);`
- Wrap both submission paths (Enter key + OK button) with `setSubmittingScore(true)` / `setSubmittingScore(false)`
- Show a spinner/text when `submittingScore` is true
- Disable input + button when `submittingScore` is true

## 3. Improve error messages

Replace the generic "Failed to save score. Please try again." with "An error has been logged to the developer." for server errors (non-400, non-409). Keep the inappropriate initials message as-is.

**File**: `src/pages/Game.tsx` (line 851)

## Technical Details

### State addition
```typescript
const [submittingScore, setSubmittingScore] = useState(false);
```

### Submission wrapper (both Enter key and OK button handlers)
```typescript
setSubmittingScore(true);
const ok = await saveToLeaderboard(initials, displayScore);
setSubmittingScore(false);
if (!ok) return;
```

### Error message change (line 851)
```typescript
setInitialsError("Error logged — the developer has been notified.");
```

### UI changes in the initials form
- Add `disabled={submittingScore}` to input and button
- Show "SUBMITTING..." text when `submittingScore` is true

