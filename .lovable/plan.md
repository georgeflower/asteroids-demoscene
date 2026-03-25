

# Fix: Build Errors in Edge Function + Admin Monitor Network Error

## Two Issues

1. **Build errors**: All 34 TypeScript errors stem from the Supabase client being strongly typed with no schema knowledge. `createClient()` without a type parameter infers `never` for all table operations. Fix: explicitly type the client as `any` schema.

2. **Admin Monitor "NetworkError"**: The edge function fails to deploy because of the build errors above. Once deployed, admin login will work.

## Plan

### 1. Fix Supabase client typing in `supabase/functions/submit/index.ts`

Change the `createClient` call to disable strict typing by passing a generic `any` type, and update all handler function signatures to accept `any` instead of `ReturnType<typeof createClient>`:

```typescript
// At the top, define a type alias
type SupabaseAdmin = ReturnType<typeof createClient>;

// In the main handler, create with explicit any schema:
const supabaseAdmin = createClient<any>(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
```

And update each handler signature from:
```typescript
async function handleStartSession(req: Request, supabaseAdmin: ReturnType<typeof createClient>)
```
to:
```typescript
async function handleStartSession(req: Request, supabaseAdmin: any)
```

This applies to all 6 handler functions: `handleStartSession`, `handleHeartbeat`, `handleSubmit`, `handleAdminData`, `handleAdminDelete`, plus any other handlers.

### Files changed
- `supabase/functions/submit/index.ts` — fix client typing (one `createClient<any>` call + `any` param type on all handlers)

