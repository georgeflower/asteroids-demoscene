

# Fix: White Screen / App Not Loading

## Diagnosis

The app shows a blank white page with zero console logs and zero network requests. This indicates the Vite development server failed to compile the application — the JavaScript bundle never loads.

The most likely cause is a **type compatibility issue** introduced when the database types file (`src/integrations/supabase/types.ts`) was auto-regenerated after the last migration. The regenerated file includes a newer `__InternalSupabase` type block with `PostgrestVersion: "14.1"` that may be incompatible with the currently installed `@supabase/supabase-js@^2.98.0`.

Since both `types.ts` and `client.ts` are auto-generated and cannot be edited directly, the fix is to **update the Supabase JS client package** to the latest version that supports this types format.

## Plan

### 1. Update `@supabase/supabase-js` to latest

In `package.json`, bump the version to ensure compatibility with the new types format:

```json
"@supabase/supabase-js": "^2.49.1"
```

(The resolved version in `node_modules` needs to match or exceed what the type generator expects.)

### 2. If the package is already compatible — force rebuild

If updating the package doesn't resolve it, the issue may be a stale build cache. A clean reinstall of dependencies would fix it.

## Files changed
- `package.json` — update `@supabase/supabase-js` version constraint if needed

## Note
If the white screen persists after this change, I'll need to use browser tools to capture the actual build error from the preview to diagnose further.

