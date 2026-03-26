-- Security audit log for sensitive admin operations
-- Tracks admin logins, logouts, score deletions, and other sensitive events

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  ip_address text,
  user_agent text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for time-based queries
CREATE INDEX idx_security_audit_log_created_at ON public.security_audit_log(created_at DESC);
CREATE INDEX idx_security_audit_log_event_type ON public.security_audit_log(event_type);

-- Enable RLS
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (accessed via Edge Function only)
CREATE POLICY "Service role manages security audit log"
  ON public.security_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin sessions table for secure, short-lived admin authentication tokens
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  invalidated boolean NOT NULL DEFAULT false
);

-- Index for token lookups
CREATE INDEX idx_admin_sessions_token ON public.admin_sessions(token);
CREATE INDEX idx_admin_sessions_expires_at ON public.admin_sessions(expires_at);

-- Enable RLS
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can manage admin sessions
CREATE POLICY "Service role manages admin sessions"
  ON public.admin_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Revoke access from public roles
REVOKE ALL ON public.security_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_sessions FROM PUBLIC, anon, authenticated;
