# Checking Specific Highscore: 54936b71-eb3b-4295-bc4a-0b25a68d022d

## Problem Statement

Check if the highscore with ID `54936b71-eb3b-4295-bc4a-0b25a68d022d` (initials: LW, score: 345690) was submitted by a real game session or manually.

## Current Status

**Before this PR is deployed**, the tracking system doesn't exist, so:
- ❓ **Cannot be verified** - The database doesn't have the necessary metadata columns yet

**After this PR is deployed**, you can verify using one of the methods below.

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

### Method 2: Node.js Script

```bash
node scripts/check-highscore-legitimacy.mjs 54936b71-eb3b-4295-bc4a-0b25a68d022d
```

### Method 3: Deno Script

```bash
deno run --allow-env --allow-net scripts/check-highscore-legitimacy.ts 54936b71-eb3b-4295-bc4a-0b25a68d022d
```

---

## Expected Result

Since the score `54936b71-eb3b-4295-bc4a-0b25a68d022d` already exists in the database:

### After Deployment:
- **submission_method**: `legacy`
- **session_token**: `NULL`
- **Status**: ⚠️  **LEGACY SUBMISSION**

**Interpretation:**
> This score existed before the session tracking system was implemented. We cannot definitively verify whether it was submitted through a real game session or manually inserted. It will be marked as "legacy".

---

## For Future Scores

After this PR is deployed, all **new** highscore submissions will include:

1. **session_token** - The unique UUID from the game session
2. **submission_method** - Set to `edge_function` for normal game submissions

You can verify any future score by:
- Checking if `submission_method = 'edge_function'` ✅ = Real game
- Checking if `submission_method = 'manual'` 🔴 = Admin inserted
- Checking if session_token is present and valid

---

## Summary

**Problem**: Check if highscore `54936b71-eb3b-4295-bc4a-0b25a68d022d` was legitimate

**Answer**: 
- **Current State**: Cannot verify (tracking system not deployed)
- **After Deployment**: Will be marked as "legacy" - unverifiable because it predates the tracking system
- **For Future**: All new scores will be trackable and verifiable

**Solution Provided**:
1. Database migration to add `session_token` and `submission_method` columns
2. Updated Edge Function to store session tokens with submissions
3. Admin scripts (Node.js and Deno) to check any score
4. SQL query for direct database verification
5. Documentation in SECURITY.md and scripts/README.md

**Deployment Required**:
```bash
supabase db push  # Apply migration
supabase functions deploy submit-score  # Deploy updated function
```
