# Migration Guide: Lovable Cloud → Supabase

This guide explains how to complete the migration from Lovable Cloud to your self-hosted Supabase instance.

## ✅ Already Completed

The code has been updated to point to the new Supabase instance at `https://octtiovyulpcikcnpfwb.supabase.co`.

## 📋 Steps to Complete Migration

### 1. Set Up Database Schema

Run the migration script to create the database schema in your new Supabase instance:

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/octtiovyulpcikcnpfwb
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase/migrations/001_initial_schema.sql`
4. Click **Run** to execute the migration

### 2. Migrate Existing Data (Optional)

If you want to preserve existing high scores from the old Lovable Cloud instance:

#### Export from Old Instance

1. Go to the old Supabase dashboard (if you have access)
2. Navigate to **Table Editor** → **high_scores**
3. Click **Export** → **CSV**
4. Save the file

#### Import to New Instance

1. Go to your new Supabase Dashboard: https://supabase.com/dashboard/project/octtiovyulpcikcnpfwb
2. Navigate to **Table Editor** → **high_scores**
3. Click **Insert** → **Import CSV**
4. Upload your exported CSV file

Alternatively, if you have the Supabase CLI installed, you can use SQL to export/import:

```bash
# Export from old instance (requires access)
supabase db dump --project-id ctrucihctxgwzprpaylb --data-only -f old_data.sql

# Import to new instance
supabase db push --project-id octtiovyulpcikcnpfwb -f old_data.sql
```

### 3. Deploy Edge Functions

Deploy the `scenestream-proxy` edge function to your new Supabase instance:

```bash
# Login to Supabase CLI
supabase login

# Link to your project
supabase link --project-ref octtiovyulpcikcnpfwb

# Deploy the edge function
supabase functions deploy scenestream-proxy
```

### 4. Update Environment Variables

If you're deploying to a hosting platform (Vercel, Netlify, etc.), update the environment variables there:

- `VITE_SUPABASE_PROJECT_ID=octtiovyulpcikcnpfwb`
- `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_uuXOsIaT3dJndvoiTBJ2xg_t3UpDUKf`
- `VITE_SUPABASE_URL=https://octtiovyulpcikcnpfwb.supabase.co`

### 5. Test the Application

1. Run the application locally:
   ```bash
   npm install
   npm run dev
   ```

2. Test the following features:
   - ✅ Play the game and submit a high score
   - ✅ View the leaderboard
   - ✅ Online multiplayer (room creation and joining)
   - ✅ Music streaming from Nectarine Demoscene Radio

### 6. Deploy

Once everything is tested and working:

```bash
npm run build
# Deploy to your hosting platform
```

## 🔍 Verification Checklist

- [ ] Database schema created successfully
- [ ] High scores save and display correctly
- [ ] Online multiplayer works (uses Supabase Realtime)
- [ ] Edge function deployed and accessible
- [ ] No console errors related to Supabase
- [ ] Application works in production

## 🆘 Troubleshooting

### "Invalid API key" errors
- Double-check that the `VITE_SUPABASE_PUBLISHABLE_KEY` is correct
- Ensure the key is the **anon/public** key, not the service role key

### Database connection issues
- Verify the `VITE_SUPABASE_URL` matches your project URL
- Check that RLS policies are enabled (they should allow public access for this game)

### Edge function not working
- Make sure the function is deployed: `supabase functions list`
- Check function logs: `supabase functions logs scenestream-proxy`

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
