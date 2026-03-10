# Changelog

All notable changes to asteroids-demoscene are documented here.

## [0.1.02] - 2026-03-10

### Added
- `.github/workflows/copilot-setup-steps.yml` – hardened CI workflow for the Copilot coding agent: checkout with LFS, Node 20, `npm ci`, lint, unit tests with coverage, security audit, and build.
- `src/lib/utils.test.ts` – initial unit test suite for the `cn` utility (vitest).
- `vitest` + `@vitest/coverage-v8` added as dev dependencies; `"test": "vitest run"` script added to `package.json`.
- Vitest configuration block added to `vite.config.ts`.

### Changed
- `actions/checkout@v5` corrected to `actions/checkout@v4` (v5 does not exist) in the workflow file.
- Version bumped from `0.1.01` → `0.1.02` per versioning convention (+0.0.01 per merge).

## [0.1.01] - 2026-03-10

### Added
- `.github/copilot-instructions.md` – repository instructions and conventions for GitHub Copilot coding agent.
- `CHANGELOG.md` – this file; tracks all version changes going forward.

### Changed
- Version bumped from `0.1.0` → `0.1.01` per versioning convention (+0.0.01 per merge).

## [0.1.0] - Initial release

- Solo asteroid-blasting gameplay with vector-graphics canvas rendering.
- Local duel mode (two players on one keyboard).
- Online duel mode via Supabase Realtime.
- Global leaderboard powered by Supabase.
- Nectarine Demoscene Radio integration for in-game music.
- Gamepad support (up to 2 controllers).
- Haptic feedback on mobile (Vibration API).
