

# Fix Build Error and Score Submission

## Problems

1. **Build error (TS2345)**: The `checkDuplicateScore` function parameter type `ReturnType<typeof createClient>` doesn't match the actual Supabase client type. Fix by using `any` for the parameter type.

2. **Runtime "Failed to fetch"**: The `start-session` call fails, so `gameSessionTokenRef` is never set, causing "No game session token available" on submit. The edge function exists at `supabase/functions/submit/index.ts` but may not be deployed. The build error itself prevents deployment.

## Fix

### 1. `supabase/functions/submit/index.ts` - Fix type error (line 101)
Change the `checkDuplicateScore` function signature from:
```typescript
supabaseAdmin: ReturnType<typeof createClient>
```
to:
```typescript
supabaseAdmin: any
```

This fixes the TS2345 build error and allows the edge function to deploy, which in turn fixes the "Failed to fetch" and "No game session token available" runtime errors.

