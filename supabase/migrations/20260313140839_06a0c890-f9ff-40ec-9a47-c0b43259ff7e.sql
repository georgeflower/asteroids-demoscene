
-- Remove the INSERT policy from high_scores to make it read-only
DROP POLICY IF EXISTS "Insert high scores with validation" ON public.high_scores;
