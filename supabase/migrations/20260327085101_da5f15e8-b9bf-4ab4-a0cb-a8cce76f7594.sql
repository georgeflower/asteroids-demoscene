
ALTER TABLE public.current_high_scores ADD COLUMN session_token text;

CREATE OR REPLACE FUNCTION public.insert_score_with_audit(p_initials text, p_score integer, p_level integer, p_time_played_seconds integer, p_source text, p_session_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_score_id uuid;
BEGIN
  INSERT INTO current_high_scores (initials, score, level, time_played_seconds, source, session_token)
  VALUES (p_initials, p_score, p_level, p_time_played_seconds, p_source, p_session_token)
  RETURNING id INTO v_score_id;

  INSERT INTO score_audit_log (score_id, session_token, submission_method)
  VALUES (v_score_id, p_session_token, 'edge_function');

  RETURN v_score_id;
END;
$function$;
