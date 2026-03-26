
-- Add anti-cheat columns to game_sessions
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS pow_challenge text,
  ADD COLUMN IF NOT EXISTS pow_difficulty integer DEFAULT 18,
  ADD COLUMN IF NOT EXISTS session_nonce text;

-- Add enriched metrics to game_session_checkpoints
ALTER TABLE public.game_session_checkpoints
  ADD COLUMN IF NOT EXISTS asteroids_destroyed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bullets_fired integer DEFAULT 0;
