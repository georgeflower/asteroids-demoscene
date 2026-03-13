
ALTER TABLE public.current_high_scores
  ADD COLUMN IF NOT EXISTS level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS time_played_seconds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS submission_method text DEFAULT 'unknown';
