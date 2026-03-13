-- Revoke direct INSERT permission from public and restrict to service role only
-- This prevents users from submitting scores directly through the browser console

-- Drop the existing permissive policy
DROP POLICY IF EXISTS "Anyone can insert valid current high scores" ON public.current_high_scores;

-- Create a more restrictive policy that only allows INSERT via service role
-- (which will be used by the Edge Function)
CREATE POLICY "Only service role can insert current high scores"
  ON public.current_high_scores
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Keep the SELECT policy as-is so everyone can view scores
-- The existing policy "Current high scores are viewable by everyone" remains unchanged
