
-- Create submission_flags table for tracking suspicious score submissions
CREATE TABLE public.submission_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id uuid NOT NULL REFERENCES public.current_high_scores(id) ON DELETE CASCADE,
  flag_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  reasoning text,
  admin_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by score
CREATE INDEX idx_submission_flags_score_id ON public.submission_flags(score_id);

-- Enable RLS
ALTER TABLE public.submission_flags ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by Edge Function)
CREATE POLICY "Service role manages submission flags"
  ON public.submission_flags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No public SELECT policy: submission_flags are only accessed via the admin Edge Function using service_role.

-- Add CHECK constraints to current_high_scores for data integrity
ALTER TABLE public.current_high_scores
  ADD CONSTRAINT check_score_non_negative CHECK (score >= 0),
  ADD CONSTRAINT check_score_max CHECK (score <= 9999999),
  ADD CONSTRAINT check_initials_format CHECK (initials ~ '^[A-Z]{1,3}$'),
  ADD CONSTRAINT check_level_valid CHECK (level IS NULL OR level >= 1),
  ADD CONSTRAINT check_time_played CHECK (time_played_seconds IS NULL OR time_played_seconds >= 0);
