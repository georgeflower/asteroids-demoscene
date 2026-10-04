# Client resilience for cloud score saves

## Scope
Update only `src/pages/Game.tsx` and `src/components/GameOverPanel.tsx`. Preserve gameplay, scoring, menu, radio, touch controls, backend code, and the panel’s established layout.

## Implementation
- Reset run-scoped submission credentials and counters before each session start, retry failed starts with generation guards, and retain the background proof-work promise.
- Make proof-work fall back safely when a worker cannot run, yielding regularly on the main thread, and wait up to 20 seconds for completion before submission.
- Harden heartbeats with response checks, one delayed network retry, forced final delivery at game over, and immediate sends after pause resume.
- Snapshot final run submission inputs once, prevent duplicate submissions, retry only transient submission failures, and expose concise cloud-save states plus retry behavior.
- Save locally first and skip cloud submission when the score cannot enter the cloud leaderboard.
- Replace the panel’s fixed status row with an always-present retry button that changes behavior without shifting the action buttons.

## Verification
- Run the project build.
- Verify session-start failure cannot retain an earlier token, rapid duplicate SAVE actions issue one submission, failed cloud saves expose the retry action, and status text fits at 360px without moving PLAY AGAIN.
