
-- Enable RLS on internal tables
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_audit_log ENABLE ROW LEVEL SECURITY;

-- Deny-all policies for game_sessions
CREATE POLICY "deny_select_game_sessions" ON public.game_sessions FOR SELECT USING (false);
CREATE POLICY "deny_insert_game_sessions" ON public.game_sessions FOR INSERT WITH CHECK (false);
CREATE POLICY "deny_update_game_sessions" ON public.game_sessions FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "deny_delete_game_sessions" ON public.game_sessions FOR DELETE USING (false);

-- Deny-all policies for game_session_checkpoints
CREATE POLICY "deny_select_checkpoints" ON public.game_session_checkpoints FOR SELECT USING (false);
CREATE POLICY "deny_insert_checkpoints" ON public.game_session_checkpoints FOR INSERT WITH CHECK (false);
CREATE POLICY "deny_update_checkpoints" ON public.game_session_checkpoints FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "deny_delete_checkpoints" ON public.game_session_checkpoints FOR DELETE USING (false);

-- Deny-all policies for score_audit_log
CREATE POLICY "deny_select_audit" ON public.score_audit_log FOR SELECT USING (false);
CREATE POLICY "deny_insert_audit" ON public.score_audit_log FOR INSERT WITH CHECK (false);
CREATE POLICY "deny_update_audit" ON public.score_audit_log FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "deny_delete_audit" ON public.score_audit_log FOR DELETE USING (false);

-- Revoke direct grants from anon and authenticated
REVOKE ALL ON public.game_sessions FROM anon, authenticated;
REVOKE ALL ON public.game_session_checkpoints FROM anon, authenticated;
REVOKE ALL ON public.score_audit_log FROM anon, authenticated;
