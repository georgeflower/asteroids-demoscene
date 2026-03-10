# Copilot Instructions for asteroids-demoscene

## Project Overview

This is a retro vector-graphics Asteroids arcade game built with:
- **React 18** + **TypeScript** (Vite)
- **Tailwind CSS** + **shadcn/ui** components
- **Supabase** for online multiplayer and leaderboards
- **Canvas API** for all game rendering

Game modes: Solo, Local Duel (split keyboard), Online Duel (WebSocket via Supabase Realtime).

Play at: https://asteroids-demoscene.lovable.app/

## Repository Structure

```
src/
  pages/Game.tsx        # Main game component (all game logic, rendering, state)
  utils/haptics.ts      # Vibration API helpers
  components/ui/        # shadcn/ui component library
public/                 # Static assets
supabase/               # Supabase edge functions and config
```

## Coding Conventions

- Use **TypeScript** strict mode; avoid `any` where possible.
- Game logic lives in `src/pages/Game.tsx` using `useCallback` and `useRef` for performance.
- All canvas drawing is done inside `useCallback` hooks that reference `canvasRef`.
- Tailwind utility classes for all UI outside the canvas.
- Follow the existing patterns in `Game.tsx` for new game features (e.g., adding new asteroid types, power-ups).

## Versioning & Changelog Rules

> **IMPORTANT**: Every merged PR **must** increment `GAME_VERSION` by `+0.0.01` and add a corresponding entry to `CHANGELOG.md`.

- `GAME_VERSION` is defined near the top of `src/pages/Game.tsx` as a string constant.
- Version format: `X.Y.ZZ` (e.g., `0.1.00`, `0.1.01`, `0.1.02`, …).
- Add a new entry at the top of `CHANGELOG.md` describing what changed.

## Build & Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

## Testing

There is no automated test suite. Verify changes manually in the browser by running `npm run dev`.

## Key Constants (in `src/pages/Game.tsx`)

- `GAME_VERSION` – displayed in the top-right corner of the canvas and shown on update.
- `CANVAS_WIDTH` / `CANVAS_HEIGHT` – virtual canvas resolution.
- `DEBUG_ENABLED` – set to `true` only in development builds.
