# Deployment Guide: Secure Highscore Submission

## Overview
This guide provides step-by-step instructions for deploying the secure highscore submission system.

## Prerequisites
- Supabase CLI installed (`npm install -g supabase`)
- Supabase project access
- Admin permissions on the database

## Deployment Steps

### 1. Deploy Edge Function

```bash
# Navigate to project root
cd /path/to/asteroids-demoscene

# Login to Supabase (if not already logged in)
supabase login

# Link to your Supabase project
supabase link --project-ref <your-project-ref>

# Deploy the Edge Function
supabase functions deploy submit
```

### 2. Set Environment Variables

Set the CORS environment variable for the Edge Function:

```bash
# Set the application URL (replace with your actual domain)
supabase secrets set VITE_APP_URL=https://asteroids-demoscene.lovable.app
```

Or via Supabase Dashboard:
1. Go to Edge Functions → submit → Settings
2. Add environment variable: `VITE_APP_URL` = `https://asteroids-demoscene.lovable.app`

### 3. Run Database Migration

```bash
# Apply the migration to restrict INSERT permissions
supabase db push

# Or manually run the migration SQL:
supabase db execute --file supabase/migrations/20260313120300_secure_highscore_submission.sql
```

**Migration Contents:**
- Drops the permissive INSERT policy
- Creates service_role-only INSERT policy
- Maintains public SELECT for viewing leaderboard

### 4. Verify Edge Function Deployment

Test the Edge Function endpoints:

```bash
# Test session creation
curl -X POST https://<your-project-ref>.supabase.co/functions/v1/submit/start-session \
  -H "Authorization: Bearer <your-anon-key>" \
  -H "Content-Type: application/json"

# Expected response:
# {"sessionToken":"uuid-here"}
```

### 5. Update Client Environment Variables

Ensure your frontend environment variables are set correctly:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
```

### 6. Test Score Submission Flow

1. Start a new game
2. Play until game over
3. If high score, enter initials
4. Verify score appears in leaderboard
5. Check browser console for any errors

### 7. Monitor Edge Function Logs

```bash
# View real-time logs
supabase functions logs submit --tail

# Or via Dashboard:
# Edge Functions → submit → Logs
```

## Verification Checklist

After deployment, verify:

- [ ] Edge Function is deployed and accessible
- [ ] Environment variables are set (VITE_APP_URL)
- [ ] Database migration has been applied
- [ ] Public INSERT is blocked (try direct insert via SQL editor - should fail)
- [ ] Service role INSERT works (Edge Function can insert)
- [ ] Game session token is created when starting game
- [ ] Score submission works through Edge Function
- [ ] Duplicate score detection works
- [ ] Rate limiting works (try submitting >10 scores)
- [ ] Submission throttling works (try rapid submissions)
- [ ] Leaderboard displays correctly

## Testing Direct INSERT (Should Fail)

Try this in Supabase SQL Editor (should fail with permission error):

```sql
INSERT INTO current_high_scores (initials, score)
VALUES ('TST', 12345);
```

Expected error: `permission denied for table current_high_scores`

## Rollback Plan

If issues occur, rollback by:

1. **Restore old INSERT policy:**
```sql
DROP POLICY IF EXISTS "Only service role can insert current high scores" ON public.current_high_scores;

CREATE POLICY "Anyone can insert valid current high scores"
  ON public.current_high_scores
  FOR INSERT
  TO public
  WITH CHECK ((length(initials) > 0) AND (score >= 0));
```

2. **Update client to use direct Supabase insert:**
Revert changes in `src/pages/Game.tsx` to use old `saveToLeaderboard` function

## Troubleshooting

### Edge Function Returns 500 Error
- Check Edge Function logs for errors
- Verify SUPABASE_SERVICE_ROLE_KEY is set (automatic in Supabase)
- Ensure VITE_APP_URL environment variable is set

### Scores Not Appearing
- Check browser console for errors
- Verify game session token is created (check Network tab)
- Check Edge Function logs for validation errors
- Ensure migration was applied correctly

### CORS Errors
- Verify VITE_APP_URL matches your frontend domain
- Check CORS headers in Edge Function response
- Clear browser cache and try again

### Session Expired Errors
- This is normal after 1 hour of inactivity
- Start a new game to get a fresh session
- Check Edge Function logs for session timeout messages

## Security Considerations

### Production Recommendations
1. **Monitor Edge Function usage** for unusual patterns
2. **Review logs regularly** for abuse attempts
3. **Consider implementing** persistent session storage if traffic is high
4. **Set up alerts** for unusual spike in submissions
5. **Implement IP-based rate limiting** if abuse continues

### Known Limitations
- In-memory session storage resets on cold starts (~15-30 min inactivity)
- Users may need to restart game if cold start occurs
- Consider Redis/Deno KV for high-traffic scenarios

## Support

If you encounter issues during deployment:
1. Check Edge Function logs
2. Verify all environment variables
3. Review browser console for client errors
4. Check database migration status
5. Refer to SECURITY.md for architecture details

## Post-Deployment

After successful deployment:
1. Monitor score submissions for the first 24 hours
2. Check for any unusual patterns or errors
3. Gather user feedback
4. Consider implementing additional analytics

## Success Criteria

Deployment is successful when:
- ✅ Users can submit scores through normal gameplay
- ✅ Direct database manipulation is blocked
- ✅ Duplicate scores are rejected
- ✅ Rate limiting works correctly
- ✅ No errors in production logs
- ✅ Leaderboard displays correctly
