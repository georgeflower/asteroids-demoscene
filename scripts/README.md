# Checking Highscore Legitimacy

## Quick Check: SQL Query

To immediately check if the highscore with ID `54936b71-eb3b-4295-bc4a-0b25a68d022d` (LW, 345690) was submitted legitimately, run this SQL query in the Supabase SQL Editor:

### Step 1: Check if tracking columns exist

```sql
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'current_high_scores' 
  AND column_name IN ('session_token', 'submission_method');
```

**If no columns are returned**, the tracking system has not been deployed yet. In this case:
- All existing scores are **unverified** (they predate the tracking system)
- You cannot determine if they were submitted through the game or manually

### Step 2: Query the specific highscore

```sql
SELECT 
  id,
  initials,
  score,
  created_at,
  session_token,
  submission_method,
  CASE 
    WHEN submission_method = 'edge_function' AND session_token IS NOT NULL 
      THEN '✅ LEGITIMATE - Submitted through game session'
    WHEN submission_method = 'manual' 
      THEN '🔴 MANUAL - Inserted by administrator'
    WHEN submission_method = 'legacy' 
      THEN '⚠️  LEGACY - Predates tracking system'
    ELSE '❓ UNKNOWN - No tracking metadata'
  END as legitimacy_status
FROM current_high_scores
WHERE id = '54936b71-eb3b-4295-bc4a-0b25a68d022d';
```

### Interpretation

**For the specific score (54936b71-eb3b-4295-bc4a-0b25a68d022d, LW, 345690):**

| submission_method | session_token | Verdict |
|-------------------|---------------|---------|
| `edge_function` | Present (UUID) | ✅ **LEGITIMATE** - Real game session |
| `manual` | NULL or Present | 🔴 **MANUAL** - Admin insertion |
| `legacy` | NULL | ⚠️  **LEGACY** - Predates tracking |
| NULL | NULL | ❓ **UNKNOWN** - Tracking not deployed |

---

## Automated Scripts

After applying the database migration, you can use the automated scripts:

### Node.js Script

```bash
node scripts/check-highscore-legitimacy.mjs <score_id>
```

**Example:**
```bash
node scripts/check-highscore-legitimacy.mjs 54936b71-eb3b-4295-bc4a-0b25a68d022d
```

### Deno Script (for Edge Function environment)

```bash
deno run --allow-env --allow-net scripts/check-highscore-legitimacy.ts <score_id>
```

**Example:**
```bash
deno run --allow-env --allow-net scripts/check-highscore-legitimacy.ts 54936b71-eb3b-4295-bc4a-0b25a68d022d
```

### Requirements

- `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
- Database migration applied
- Node.js or Deno runtime
- Network access to Supabase

### Example Output

```
🔍 Checking highscore legitimacy...

Score ID: 54936b71-eb3b-4295-bc4a-0b25a68d022d

📊 Highscore Details:
──────────────────────────────────────────────────
  ID:          54936b71-eb3b-4295-bc4a-0b25a68d022d
  Initials:    LW
  Score:       345,690
  Created:     3/13/2026, 12:45:00 PM
  Session Token: (none)
  Method:      legacy
──────────────────────────────────────────────────

🔎 Legitimacy Assessment:
──────────────────────────────────────────────────
⚠️  LEGACY SUBMISSION
   This score existed before the session token system was
   implemented. Cannot verify if it was from a real game session.

   This could be:
   • A legitimate score from before the security update
   • A manually inserted score from the early days
──────────────────────────────────────────────────
```

---

## Deployment Steps

To enable highscore legitimacy checking:

### 1. Apply database migration

```bash
cd /home/runner/work/asteroids-demoscene/asteroids-demoscene
supabase db push
```

Or manually run the SQL from `/supabase/migrations/20260313125000_add_submission_tracking.sql` in the Supabase SQL Editor.

This adds `session_token` and `submission_method` columns to track submissions.

### 2. Deploy updated Edge Function

```bash
supabase functions deploy submit-score
```

This ensures new scores include session token metadata.

### 3. Run the check

```bash
node scripts/check-highscore-legitimacy.mjs 54936b71-eb3b-4295-bc4a-0b25a68d022d
```

### 4. Interpret results

- If the score predates deployment → Marked as `legacy` (unverifiable)
- If the score has session token → Marked as `edge_function` (legitimate)
- If the score was manually inserted → Marked as `manual` (admin action)

---

## Checking the Specific Score

For the score mentioned in the issue (ID: 54936b71-eb3b-4295-bc4a-0b25a68d022d, LW, 345690):

**Without deploying changes (current state):**
- The tracking columns don't exist yet
- The score is **unverified** - we cannot determine if it was submitted legitimately

**After deploying changes:**
- Run: `node scripts/check-highscore-legitimacy.mjs 54936b71-eb3b-4295-bc4a-0b25a68d022d`
- The score will be marked as `legacy` since it predates the tracking system
- **Conclusion**: Cannot definitively verify if it was a real game submission or manual insertion

**For future scores:**
- All new submissions will include session token metadata
- Legitimacy can be verified by checking the `submission_method` and `session_token` fields
