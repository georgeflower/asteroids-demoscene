-- Create an RPC function to fetch the top-3 hall of fame entries server-side.
-- Deduplicates by initials (best score per initials), merging both score tables,
-- and returns only the top 3 rows needed by the client.

CREATE OR REPLACE FUNCTION public.get_hall_of_fame()
RETURNS TABLE (
  initials text,
  score bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT initials, score, created_at
  FROM (
    SELECT
      UPPER(initials) AS initials,
      MAX(score) AS score,
      MAX(created_at) AS created_at
    FROM (
      SELECT initials, score, created_at FROM public.high_scores
      UNION ALL
      SELECT initials, score, created_at FROM public.current_high_scores
    ) combined
    GROUP BY UPPER(initials)
  ) deduped
  ORDER BY score DESC
  LIMIT 3;
$$;

-- Grant execute to anon and authenticated so the client can call it
GRANT EXECUTE ON FUNCTION public.get_hall_of_fame() TO anon, authenticated;
