

# Fix: Infinite reload loop on start screen

## Root Cause
`src/hooks/useVersionCheck.ts` has `CURRENT_VERSION = "0.3.0"` while `public/version.json` has `"0.3.1"`. Every page load detects a "new version" and calls `window.location.reload()`, creating an infinite loop that causes the white-to-black blinking.

## Fix
Update line 3 of `src/hooks/useVersionCheck.ts`:
```typescript
const CURRENT_VERSION = "0.3.1";
```

One line change, one file.

