
-- Add max score cap and rate limiting to current_high_scores
-- Drop old permissive insert policy
DROP POLICY IF EXISTS "Anyone can insert valid current high scores" ON public.current_high_scores;

-- New insert policy with score cap (max realistic score ~9,999,990) and rate limit (1 per 60s per initials)
CREATE POLICY "Insert current high scores with validation" ON public.current_high_scores
FOR INSERT TO public
WITH CHECK (
  length(initials) > 0 
  AND length(initials) <= 3
  AND score >= 0 
  AND score <= 9999990
  AND NOT EXISTS (
    SELECT 1 FROM public.current_high_scores chs
    WHERE chs.initials = initials
    AND chs.created_at > now() - interval '60 seconds'
  )
);

-- Same for high_scores table
DROP POLICY IF EXISTS "Anyone can insert valid high scores" ON public.high_scores;

CREATE POLICY "Insert high scores with validation" ON public.high_scores
FOR INSERT TO public
WITH CHECK (
  length(initials) > 0
  AND length(initials) <= 3
  AND score >= 0
  AND score <= 9999990
  AND NOT EXISTS (
    SELECT 1 FROM public.high_scores hs
    WHERE hs.initials = initials
    AND hs.created_at > now() - interval '60 seconds'
  )
);
