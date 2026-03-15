-- Create game_sessions table for persistent session tracking
CREATE TABLE public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  submission_count int NOT NULL DEFAULT 0,
  last_submission_at timestamptz,
  expired boolean NOT NULL DEFAULT false
);

-- Enable RLS with NO public policies = only service_role can access
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Index for fast token lookups
CREATE INDEX idx_game_sessions_token ON public.game_sessions(token);

-- Auto-cleanup old sessions (older than 2 hours)
CREATE OR REPLACE FUNCTION public.cleanup_old_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.game_sessions
  WHERE started_at < now() - interval '2 hours';
END;
$$;