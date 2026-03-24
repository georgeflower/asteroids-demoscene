
-- Create checkpoints table for heartbeat tracking
CREATE TABLE public.game_session_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  reported_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast lookups by session token
CREATE INDEX idx_checkpoints_session_token ON public.game_session_checkpoints(session_token);

-- Enable RLS but no public policies (only service_role access)
ALTER TABLE public.game_session_checkpoints ENABLE ROW LEVEL SECURITY;

-- Update cleanup function to also delete old checkpoints
CREATE OR REPLACE FUNCTION public.cleanup_old_sessions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete checkpoints for old sessions first
  DELETE FROM public.game_session_checkpoints
  WHERE session_token IN (
    SELECT token FROM public.game_sessions
    WHERE started_at < now() - interval '2 hours'
  );
  -- Then delete old sessions
  DELETE FROM public.game_sessions
  WHERE started_at < now() - interval '2 hours';
END;
$function$;
