ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS flags jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.rejected_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_token text,
  initials text,
  score integer,
  level integer,
  code text NOT NULL,
  message text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  origin text,
  user_agent text,
  approved boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.rejected_submissions TO service_role;
ALTER TABLE public.rejected_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_rejected" ON public.rejected_submissions;
CREATE POLICY "deny_all_rejected" ON public.rejected_submissions FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON public.rejected_submissions FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_rejected_created ON public.rejected_submissions(created_at DESC);

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

ALTER TABLE public.current_high_scores DROP CONSTRAINT IF EXISTS check_score_non_negative;
ALTER TABLE public.current_high_scores DROP CONSTRAINT IF EXISTS check_score_max;
ALTER TABLE public.current_high_scores DROP CONSTRAINT IF EXISTS check_initials_format;
ALTER TABLE public.current_high_scores DROP CONSTRAINT IF EXISTS check_level_valid;
ALTER TABLE public.current_high_scores DROP CONSTRAINT IF EXISTS check_time_played;
ALTER TABLE public.current_high_scores
  ADD CONSTRAINT check_score_non_negative CHECK (score >= 0),
  ADD CONSTRAINT check_score_max CHECK (score <= 9999999),
  ADD CONSTRAINT check_initials_format CHECK (initials ~ '^[A-Z]{1,3}$'),
  ADD CONSTRAINT check_level_valid CHECK (level IS NULL OR level >= 1),
  ADD CONSTRAINT check_time_played CHECK (time_played_seconds IS NULL OR time_played_seconds >= 0);
