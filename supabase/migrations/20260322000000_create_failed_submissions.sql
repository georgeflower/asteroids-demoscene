-- Create failed_submissions table for tracking score submission errors
CREATE TABLE public.failed_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  initials text,
  score integer,
  game_session_token text,
  client_timestamp bigint,
  level integer,
  time_played_seconds integer,
  session_age_seconds integer,
  session_submission_count integer,
  error_type text NOT NULL,
  error_message text NOT NULL,
  source text,
  raw_submission jsonb,
  likely_valid boolean NOT NULL DEFAULT false,
  email_sent boolean NOT NULL DEFAULT false
);

-- Enable RLS with NO public policies — service_role only
ALTER TABLE public.failed_submissions ENABLE ROW LEVEL SECURITY;

-- Index for lookups by token and time
CREATE INDEX idx_failed_submissions_token ON public.failed_submissions(game_session_token);
CREATE INDEX idx_failed_submissions_created_at ON public.failed_submissions(created_at);
