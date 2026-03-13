-- Add submission tracking metadata to current_high_scores table
-- This allows verification of whether scores were submitted through legitimate game sessions

ALTER TABLE public.current_high_scores
  ADD COLUMN session_token uuid,
  ADD COLUMN submission_method text DEFAULT 'edge_function' CHECK (submission_method IN ('edge_function', 'manual', 'legacy'));

-- Add index for faster lookups by session token
CREATE INDEX idx_current_high_scores_session_token ON public.current_high_scores(session_token);

-- Add comment explaining the columns
COMMENT ON COLUMN public.current_high_scores.session_token IS 'The session token used to submit this score. NULL for manually inserted or legacy scores.';
COMMENT ON COLUMN public.current_high_scores.submission_method IS 'Method used to submit the score: edge_function (via game session), manual (admin insert), or legacy (migrated old data)';

-- Mark existing scores as legacy since they don't have session tokens
UPDATE public.current_high_scores
SET submission_method = 'legacy'
WHERE submission_method IS NULL OR session_token IS NULL;
