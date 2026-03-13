# Checking Specific Highscore: 54936b71-eb3b-4295-bc4a-0b25a68d022d

## Problem Statement

Check if the highscore with ID `54936b71-eb3b-4295-bc4a-0b25a68d022d` (initials: LW, score: 345690) was submitted by a real game session or manually.

## Answer

### Current Status (Before Deployment)

**Before this PR is deployed**, the tracking system doesn't exist, so:
- ❓ **Cannot be verified** - The database doesn't have the necessary metadata columns yet
- All scores in the database are unverified and unverifiable

### After Deployment

**After this PR is deployed** (migration applied + Edge Function updated):

1. **For the specific score in question**:
   - Will be marked as `submission_method = 'legacy'`
   - Will have `session_token = NULL`
   - **Status**: ⚠️  **LEGACY SUBMISSION** (unverifiable)
   
2. **Why it's unverifiable**:
   - The score already exists in the database
   - No session token was stored at the time of submission (feature didn't exist)
   - Cannot retroactively determine if it was from a real game session or manual insertion

3. **Recommendation**:
   - If you need to verify this specific score, check database insertion logs or audit logs
   - Consider removing it if legitimacy is critical
   - Going forward, all new scores will be verifiable with this system

---

## How to Check (After Deployment)

### Method 1: SQL Query (Fastest)

Run this query in Supabase SQL Editor:

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

**Expected Result:**
```
id: 54936b71-eb3b-4295-bc4a-0b25a68d022d
initials: LW
score: 345690
created_at: [some timestamp]
session_token: NULL
submission_method: legacy
legitimacy_status: ⚠️  LEGACY - Predates tracking system
```

### Method 2: Node.js Script

```bash
node scripts/check-highscore-legitimacy.mjs 54936b71-eb3b-4295-bc4a-0b25a68d022d
```

**Expected Output:**
```
🔍 Checking highscore legitimacy...

Score ID: 54936b71-eb3b-4295-bc4a-0b25a68d022d

📊 Highscore Details:
──────────────────────────────────────────────────
  ID:          54936b71-eb3b-4295-bc4a-0b25a68d022d
  Initials:    LW
  Score:       345,690
  Created:     [timestamp]
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

### Method 3: Deno Script

```bash
deno run --allow-env --allow-net scripts/check-highscore-legitimacy.ts 54936b71-eb3b-4295-bc4a-0b25a68d022d
```

---

## For Future Scores

After this PR is deployed, all **new** highscore submissions will include:

1. **session_token** - The unique UUID from the game session
2. **submission_method** - Set to `edge_function` for normal game submissions

You can verify any future score by:
- ✅ `submission_method = 'edge_function'` + session_token present = **Real game**
- 🔴 `submission_method = 'manual'` = **Admin inserted**
- ⚠️  `submission_method = 'legacy'` = **Predates tracking** (unverifiable)

---

## Solution Provided

**Problem**: Check if highscore `54936b71-eb3b-4295-bc4a-0b25a68d022d` was legitimate

**Answer for this specific score**: 
- **Current State**: Cannot verify (tracking system not deployed)
- **After Deployment**: Will be marked as "legacy" - unverifiable because it predates the tracking system
- **Recommendation**: Check database audit logs if available, or remove if legitimacy is critical

**Solution for all future scores**:
1. ✅ Database migration adds `session_token` and `submission_method` columns
2. ✅ Edge Function updated to store session tokens with submissions  
3. ✅ Admin scripts (Node.js and Deno) to check any score
4. ✅ SQL query for direct database verification
5. ✅ Documentation in SECURITY.md and scripts/README.md

**Deployment Steps**:
```bash
supabase db push                          # Apply migration
supabase functions deploy submit-score    # Deploy updated function
node scripts/check-highscore-legitimacy.mjs 54936b71-eb3b-4295-bc4a-0b25a68d022d  # Check the score
```

