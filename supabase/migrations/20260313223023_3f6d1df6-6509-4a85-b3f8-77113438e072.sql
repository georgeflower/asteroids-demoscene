
-- Function to clean up scores that have no audit log entry
-- Uses a deferred constraint trigger approach
CREATE OR REPLACE FUNCTION public.cleanup_unaudited_scores()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if audit log exists for this score
  IF NOT EXISTS (
    SELECT 1 FROM public.score_audit_log WHERE score_id = NEW.id
  ) THEN
    -- No audit log = not submitted through edge function = delete it
    DELETE FROM public.current_high_scores WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a deferred constraint trigger that fires at end of transaction
CREATE CONSTRAINT TRIGGER verify_score_audit
  AFTER INSERT ON public.current_high_scores
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_unaudited_scores();
