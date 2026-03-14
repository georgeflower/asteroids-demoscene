CREATE OR REPLACE FUNCTION public.insert_score_with_audit(
  p_initials TEXT,
  p_score INTEGER,
  p_level INTEGER,
  p_time_played_seconds INTEGER,
  p_source TEXT,
  p_session_token TEXT
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score_id uuid;
BEGIN
  INSERT INTO current_high_scores (initials, score, level, time_played_seconds, source)
  VALUES (p_initials, p_score, p_level, p_time_played_seconds, p_source)
  RETURNING id INTO v_score_id;

  INSERT INTO score_audit_log (score_id, session_token, submission_method)
  VALUES (v_score_id, p_session_token, 'edge_function');

  RETURN v_score_id;
END;
$$;