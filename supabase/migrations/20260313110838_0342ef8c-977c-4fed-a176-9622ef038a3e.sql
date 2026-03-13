
CREATE TABLE public.current_high_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  initials text NOT NULL
);

ALTER TABLE public.current_high_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert valid current high scores"
  ON public.current_high_scores
  FOR INSERT
  TO public
  WITH CHECK ((length(initials) > 0) AND (score >= 0));

CREATE POLICY "Current high scores are viewable by everyone"
  ON public.current_high_scores
  FOR SELECT
  TO public
  USING (true);
