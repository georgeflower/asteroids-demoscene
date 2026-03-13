
-- Create audit table (no public access)
CREATE TABLE public.score_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id uuid NOT NULL REFERENCES public.current_high_scores(id) ON DELETE CASCADE,
  session_token text,
  submission_method text DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.score_audit_log ENABLE ROW LEVEL SECURITY;

-- Remove exposed columns from public table
ALTER TABLE public.current_high_scores DROP COLUMN IF EXISTS session_token;
ALTER TABLE public.current_high_scores DROP COLUMN IF EXISTS submission_method;
