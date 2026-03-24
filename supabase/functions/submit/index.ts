import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScoreSubmission {
  initials: string;
  score: number;
  gameSessionToken: string;
  timestamp: number;
  level?: number;
  timePlayedSeconds?: number;
  source?: string;
}

interface HeartbeatPayload {
  gameSessionToken: string;
  score: number;
  level: number;
}

// --- Constants ---
const MAX_SUBMISSIONS_PER_SESSION = 10;
const SESSION_TIMEOUT_MS = 3600000; // 1 hour
const MIN_SUBMISSION_INTERVAL_MS = 5000;
const MAX_VALID_SCORE = 500000;
const MAX_SCORE_PER_SECOND = 300;
const MAX_SCORE_PER_LEVEL = 40000;
const MAX_LEVEL = 30;
const MIN_PLAY_TIME_SECONDS = 10;
const MIN_HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds minimum between heartbeats
const HEARTBEAT_SCORE_THRESHOLD = 50000; // Require heartbeats for scores above this
const MIN_CHECKPOINTS_FOR_HIGH_SCORE = 2; // Minimum checkpoints needed for high scores
const MAX_CHECKPOINT_GAP_SECONDS = 90; // Max allowed gap between checkpoints
const MAX_SCORE_JUMP_PER_SECOND = 400; // Max score increase between checkpoints (generous)

const ALLOWED_ORIGINS = [
  'https://asteroids-demoscene.lovable.app',
  'https://id-preview--b6edd2f4-8993-4a05-a257-466f1a773f73.lovable.app',
  'https://b6edd2f4-8993-4a05-a257-466f1a773f73.lovableproject.com',
];

const BANNED_INITIALS = new Set([
  'ASS', 'FUK', 'FUC', 'FCK', 'SHT', 'DMN', 'HEL', 'DIE',
  'KKK', 'SEX', 'XXX', 'WTF', 'FAG', 'GAY', 'DIK', 'COK',
  'PIS', 'CUM', 'TIT', 'VAG', 'PUS', 'CNT', 'FCU', 'FKU',
  'SHI', 'POO', 'PEE', 'BTH', 'BTC', 'WTH', 'OMG', 'JFC',
  'GDM', 'SLT', 'HOR', 'BAD', 'EVL', 'HAT', 'KIL', 'BUT',
  'AZZ', 'NIG', 'JEW', 'HOE', 'STD', 'SUK', 'SUC',
]);

function isInitialsAppropriate(initials: string): boolean {
  return !BANNED_INITIALS.has(initials.toUpperCase());
}

function validateOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') || '';
  const referer = req.headers.get('referer') || '';
  if (ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.some(allowed =>
    origin.startsWith(allowed) || referer.startsWith(allowed)
  );
}

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function successResponse(data: Record<string, unknown>) {
  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// --- Handlers ---

async function handleStartSession(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  if (!validateOrigin(req)) {
    return errorResponse('Forbidden', 403);
  }

  const token = crypto.randomUUID();
  try { await supabaseAdmin.rpc('cleanup_old_sessions'); } catch (_) { /* ignore */ }

  const { error } = await supabaseAdmin.from('game_sessions').insert({ token });
  if (error) {
    console.error('Failed to create session:', error);
    return errorResponse('Failed to create session', 500);
  }

  return successResponse({ sessionToken: token });
}

async function handleHeartbeat(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  if (!validateOrigin(req)) {
    return errorResponse('Forbidden', 403);
  }

  const payload: HeartbeatPayload = await req.json();

  if (!payload.gameSessionToken || payload.score === undefined || payload.level === undefined) {
    return errorResponse('Missing required fields', 400);
  }

  if (payload.score < 0 || payload.score > MAX_VALID_SCORE) {
    return errorResponse('Invalid score', 400);
  }

  if (payload.level < 1 || payload.level > MAX_LEVEL) {
    return errorResponse('Invalid level', 400);
  }

  // Validate session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('game_sessions')
    .select('*')
    .eq('token', payload.gameSessionToken)
    .single();

  if (sessionError || !session) {
    return errorResponse('Invalid session', 403);
  }

  if (session.expired) {
    return errorResponse('Session expired', 403);
  }

  // Rate limit heartbeats
  const { data: lastCheckpoint } = await supabaseAdmin
    .from('game_session_checkpoints')
    .select('reported_at, score')
    .eq('session_token', payload.gameSessionToken)
    .order('reported_at', { ascending: false })
    .limit(1)
    .single();

  if (lastCheckpoint) {
    const timeSinceLast = Date.now() - new Date(lastCheckpoint.reported_at).getTime();
    if (timeSinceLast < MIN_HEARTBEAT_INTERVAL_MS) {
      return errorResponse('Too frequent', 429);
    }
    // Score must be monotonically increasing
    if (payload.score < lastCheckpoint.score) {
      return errorResponse('Invalid score progression', 400);
    }
  }

  // Insert checkpoint
  const { error: insertError } = await supabaseAdmin
    .from('game_session_checkpoints')
    .insert({
      session_token: payload.gameSessionToken,
      score: payload.score,
      level: payload.level,
    });

  if (insertError) {
    console.error('Failed to insert checkpoint:', insertError);
    return errorResponse('Failed to save checkpoint', 500);
  }

  return successResponse({ ok: true });
}

async function handleSubmit(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  if (!validateOrigin(req)) {
    return errorResponse('Forbidden', 403);
  }

  const submission: ScoreSubmission = await req.json();

  // --- Basic field validation ---
  if (!submission.initials || submission.score === undefined || !submission.gameSessionToken) {
    return errorResponse('Missing required fields', 400);
  }

  const initialsRegex = /^[A-Z]{1,3}$/;
  if (!initialsRegex.test(submission.initials)) {
    return errorResponse('Invalid initials format', 400);
  }

  if (!isInitialsAppropriate(submission.initials)) {
    return errorResponse('Please choose different initials', 400);
  }

  if (submission.score < 0 || submission.score > MAX_VALID_SCORE) {
    return errorResponse('Invalid score range', 400);
  }

  const validSources = ['game_client'];
  const source = submission.source || 'unknown';
  if (!validSources.includes(source)) {
    return errorResponse('Invalid submission source', 403);
  }

  // --- Validate session ---
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('game_sessions')
    .select('*')
    .eq('token', submission.gameSessionToken)
    .single();

  if (sessionError || !session) {
    return errorResponse('Invalid game session token', 403);
  }

  if (session.expired) {
    return errorResponse('Game session expired', 403);
  }

  const sessionAge = Date.now() - new Date(session.started_at).getTime();
  if (sessionAge > SESSION_TIMEOUT_MS) {
    await supabaseAdmin
      .from('game_sessions')
      .update({ expired: true })
      .eq('id', session.id);
    return errorResponse('Game session expired', 403);
  }

  if (session.submission_count >= MAX_SUBMISSIONS_PER_SESSION) {
    return errorResponse('Maximum submissions reached for this session', 403);
  }

  if (session.last_submission_at) {
    const timeSinceLast = Date.now() - new Date(session.last_submission_at).getTime();
    if (timeSinceLast < MIN_SUBMISSION_INTERVAL_MS) {
      return errorResponse('Please wait before submitting another score', 403);
    }
  }

  // --- Score plausibility ---
  const serverTimePlayedSeconds = Math.floor(sessionAge / 1000);

  if (serverTimePlayedSeconds < MIN_PLAY_TIME_SECONDS) {
    return errorResponse('Game duration too short', 403);
  }

  const maxScoreForTime = serverTimePlayedSeconds * MAX_SCORE_PER_SECOND;
  if (submission.score > maxScoreForTime) {
    console.log(`Plausibility fail: score=${submission.score}, time=${serverTimePlayedSeconds}s, max=${maxScoreForTime}`);
    return errorResponse('Score too high for game duration', 403);
  }

  if (submission.level !== undefined && submission.level !== null) {
    if (submission.level < 1 || submission.level > MAX_LEVEL) {
      return errorResponse('Invalid level value', 403);
    }
    const maxScoreForLevel = submission.level * MAX_SCORE_PER_LEVEL;
    if (submission.score > maxScoreForLevel) {
      console.log(`Plausibility fail: score=${submission.score}, level=${submission.level}, max=${maxScoreForLevel}`);
      return errorResponse('Score too high for reported level', 403);
    }
  }

  // --- Heartbeat checkpoint validation ---
  if (submission.score >= HEARTBEAT_SCORE_THRESHOLD) {
    const { data: checkpoints, error: cpError } = await supabaseAdmin
      .from('game_session_checkpoints')
      .select('*')
      .eq('session_token', submission.gameSessionToken)
      .order('reported_at', { ascending: true });

    if (cpError) {
      console.error('Failed to query checkpoints:', cpError);
      return errorResponse('Validation error', 500);
    }

    // Require minimum checkpoints for high scores
    if (!checkpoints || checkpoints.length < MIN_CHECKPOINTS_FOR_HIGH_SCORE) {
      console.log(`Checkpoint fail: score=${submission.score}, checkpoints=${checkpoints?.length ?? 0}`);
      return errorResponse('Insufficient gameplay data', 403);
    }

    // Validate checkpoint progression
    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1];
      const curr = checkpoints[i];
      const gapSeconds = (new Date(curr.reported_at).getTime() - new Date(prev.reported_at).getTime()) / 1000;

      // Check for too-large gaps (player should be sending heartbeats)
      if (gapSeconds > MAX_CHECKPOINT_GAP_SECONDS) {
        console.log(`Checkpoint gap too large: ${gapSeconds}s between checkpoints ${i-1} and ${i}`);
        return errorResponse('Gameplay data gap detected', 403);
      }

      // Check score jump between checkpoints
      const scoreDelta = curr.score - prev.score;
      const maxJump = gapSeconds * MAX_SCORE_JUMP_PER_SECOND;
      if (scoreDelta > maxJump) {
        console.log(`Score jump too large: +${scoreDelta} in ${gapSeconds}s (max ${maxJump})`);
        return errorResponse('Score progression anomaly', 403);
      }
    }

    // Check final score vs last checkpoint
    const lastCp = checkpoints[checkpoints.length - 1];
    const timeSinceLastCp = (Date.now() - new Date(lastCp.reported_at).getTime()) / 1000;
    const maxFinalJump = timeSinceLastCp * MAX_SCORE_JUMP_PER_SECOND;
    if (submission.score - lastCp.score > maxFinalJump) {
      console.log(`Final score jump too large: submitted=${submission.score}, lastCp=${lastCp.score}, gap=${timeSinceLastCp}s`);
      return errorResponse('Final score anomaly', 403);
    }
  }

  // --- Duplicate check ---
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: dupes } = await supabaseAdmin
    .from('current_high_scores')
    .select('id')
    .eq('initials', submission.initials)
    .eq('score', submission.score)
    .gte('created_at', oneHourAgo)
    .limit(1);

  if (dupes && dupes.length > 0) {
    return errorResponse('Duplicate score detected', 409);
  }

  // --- Update session counters ---
  await supabaseAdmin
    .from('game_sessions')
    .update({
      submission_count: session.submission_count + 1,
      last_submission_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  // --- Insert score + audit log ---
  const { data: scoreId, error: insertError } = await supabaseAdmin
    .rpc('insert_score_with_audit', {
      p_initials: submission.initials,
      p_score: submission.score,
      p_level: submission.level ?? 1,
      p_time_played_seconds: serverTimePlayedSeconds,
      p_source: source,
      p_session_token: submission.gameSessionToken,
    });

  if (insertError) {
    console.error('Database error:', insertError);
    return errorResponse('Failed to save score', 500);
  }

  return successResponse({ success: true, message: 'Score submitted successfully' });
}

// --- Main handler ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const url = new URL(req.url);

    if (url.pathname.endsWith('/start-session')) {
      return await handleStartSession(req, supabaseAdmin);
    }

    if (url.pathname.endsWith('/heartbeat')) {
      return await handleHeartbeat(req, supabaseAdmin);
    }

    if (url.pathname.endsWith('/submit')) {
      return await handleSubmit(req, supabaseAdmin);
    }

    return errorResponse('Invalid endpoint', 404);
  } catch (error) {
    console.error('Error:', error);
    return errorResponse('Internal server error', 500);
  }
});
