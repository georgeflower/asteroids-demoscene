

# Plan: Make `.lovable/plan.md` Private

## Problem

The `.lovable/plan.md` file contains detailed anti-cheat implementation details (PoW challenges, HMAC construction, validation logic). While it's in the `.lovable/` directory, Vite could potentially serve it if accessed directly. An attacker reading this file would know exactly how to circumvent the security measures.

## Solution

The `.lovable/` directory is not inside `public/` or `src/`, so Vite does **not** serve it in the production build — it's already excluded from the bundle. The file is only accessible via the Git repository (GitHub).

The real fix is twofold:

1. **Move sensitive details out of `plan.md`** — Replace the current content with a high-level summary that doesn't reveal implementation specifics (no mention of HMAC construction format, PoW difficulty values, or validation thresholds).

2. **Add `.lovable/` to `.gitignore`** — This prevents the file from being committed to the repository, so it won't be visible on GitHub either.

## Files Changed

| File | Change |
|------|--------|
| `.gitignore` | Add `.lovable/` entry |
| `.lovable/plan.md` | Replace with a brief, non-sensitive summary |

