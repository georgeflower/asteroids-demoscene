CREATE TABLE IF NOT EXISTS public.submission_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id uuid NOT NULL REFERENCES public.current_high_scores(id) ON DELETE CASCADE,
  flag_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  reasoning text,
  admin_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_submission_flags_score_id ON public.submission_flags(score_id);
ALTER TABLE public.submission_flags ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.submission_flags TO service_role;
DROP POLICY IF EXISTS "Service role manages submission flags" ON public.submission_flags;
CREATE POLICY "Service role manages submission flags" ON public.submission_flags
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.submission_flags FROM anon, authenticated;

ALTER TABLE public.current_high_scores
  ADD CONSTRAINT check_score_non_negative CHECK (score >= 0),
  ADD CONSTRAINT check_score_max CHECK (score <= 9999999),
  ADD CONSTRAINT check_initials_format CHECK (initials ~ '^[A-Z]{1,3}$'),
  ADD CONSTRAINT check_level_valid CHECK (level IS NULL OR level >= 1),
  ADD CONSTRAINT check_time_played CHECK (time_played_seconds IS NULL OR time_played_seconds >= 0);