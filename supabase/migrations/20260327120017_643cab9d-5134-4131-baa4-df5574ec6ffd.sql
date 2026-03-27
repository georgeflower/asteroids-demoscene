
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS last_seq integer DEFAULT 0;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS last_score integer DEFAULT 0;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS last_level integer DEFAULT 1;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS last_asteroids integer DEFAULT 0;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS last_bullets integer DEFAULT 0;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS heartbeat_count_minute integer DEFAULT 0;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS heartbeat_window_start timestamptz;
