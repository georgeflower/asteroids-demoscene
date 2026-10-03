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
CREATE POLICY "deny_all_rejected" ON public.rejected_submissions FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON public.rejected_submissions FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_rejected_created ON public.rejected_submissions(created_at DESC);