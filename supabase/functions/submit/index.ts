import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('VITE_APP_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

interface GameSession {
  token: string;
  startTime: number;
  lastScore: number;
  submissionCount: number;
  lastSubmissionTime: number;
}

// In-memory store for game sessions
// LIMITATION: This will reset on function cold starts (~15-30 minutes of inactivity).
// MITIGATION: Sessions are auto-recreated when a valid UUID token is submitted after a cold start,
// allowing legitimate score submissions to succeed. For production with high traffic,
// consider implementing persistent storage:
// - Use a Supabase table with TTL/cleanup job
// - Use Redis for distributed caching
// - Use Deno KV for edge-native key-value storage
const gameSessions = new Map<string, GameSession>();

const MAX_SUBMISSIONS_PER_SESSION = 10;
const SESSION_TIMEOUT = 3600000;
const MIN_SUBMISSION_INTERVAL = 5000;
const MAX_VALID_SCORE = 99999999;

const BANNED_INITIALS = new Set([
  'ASS', 'FUK', 'FUC', 'FCK', 'SHT', 'DMN', 'HEL', 'DIE',
  'KKK', 'SEX', 'XXX', 'WTF', 'FAG', 'GAY', 'DIK', 'COK',
  'PIS', 'CUM', 'TIT', 'VAG', 'PUS', 'CNT', 'FCU', 'FKU',
  'SHI', 'POO', 'PEE', 'BTH', 'BTC', 'WTH', 'OMG', 'JFC',
  'GDM', 'SLT', 'HOR', 'BAD', 'EVL', 'HAT', 'KIL'
]);

function isInitialsAppropriate(initials: string): boolean {
  return !BANNED_INITIALS.has(initials.toUpperCase());
}

function generateSessionToken(): string {
  return crypto.randomUUID();
}

function validateSession(token: string, score: number): { valid: boolean; error?: string; session?: GameSession } {
  let session = gameSessions.get(token);
  
  // If session not found, check if token is a valid UUID and auto-recreate it
  // This handles cold starts where the in-memory Map is cleared
  if (!session) {
    // Validate token is a proper UUID format (version 4)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return { valid: false, error: 'Invalid game session token' };
    }
    
    // Auto-recreate session to handle cold starts gracefully
    // This allows legitimate submissions to succeed even after function restarts
    console.log('Session not found in memory, auto-recreating for token:', token);
    session = {
      token,
      startTime: Date.now(),
      lastScore: 0,
      submissionCount: 0,
      lastSubmissionTime: 0,
    };
    gameSessions.set(token, session);
  }
  
  // Check session timeout
  if (Date.now() - session.startTime > SESSION_TIMEOUT) {
    gameSessions.delete(token);
    return { valid: false, error: 'Game session expired' };
  }
  const timeSinceLastSubmission = Date.now() - session.lastSubmissionTime;
  if (session.submissionCount > 0 && timeSinceLastSubmission < MIN_SUBMISSION_INTERVAL) {
    return { valid: false, error: 'Please wait before submitting another score' };
  }
  if (session.submissionCount >= MAX_SUBMISSIONS_PER_SESSION) {
    return { valid: false, error: 'Maximum submissions reached for this session' };
  }
  if (score < 0 || score > MAX_VALID_SCORE) {
    return { valid: false, error: 'Invalid score range' };
  }
  return { valid: true, session };
}

async function checkDuplicateScore(
  supabaseAdmin: ReturnType<typeof createClient>,
  initials: string,
  score: number
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('current_high_scores')
    .select('id')
    .eq('initials', initials)
    .eq('score', score)
    .gte('created_at', oneHourAgo)
    .limit(1);
  if (error) {
    console.error('Error checking duplicates:', error);
    return false;
  }
  return data && data.length > 0;
}

// Validate that score is plausible given level and time played
function validateScorePlausibility(score: number, level?: number, timePlayedSeconds?: number): { valid: boolean; error?: string } {
  if (level !== undefined) {
    if (level < 1 || level > 100) return { valid: false, error: 'Invalid level value' };
    // A very high score on level 1 is suspicious
    const maxScoreForLevel = level * 50000;
    if (score > maxScoreForLevel) return { valid: false, error: 'Score too high for reported level' };
  }
  if (timePlayedSeconds !== undefined) {
    if (timePlayedSeconds < 5) return { valid: false, error: 'Game duration too short' };
    if (timePlayedSeconds > 36000) return { valid: false, error: 'Invalid game duration' };
    // Max ~1000 points per second is generous
    const maxScoreForTime = timePlayedSeconds * 1000;
    if (score > maxScoreForTime) return { valid: false, error: 'Score too high for game duration' };
  }
  return { valid: true };
}

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
      const token = generateSessionToken();
      gameSessions.set(token, {
        token,
        startTime: Date.now(),
        lastScore: 0,
        submissionCount: 0,
        lastSubmissionTime: 0,
      });
      return new Response(
        JSON.stringify({ sessionToken: token }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (url.pathname.endsWith('/submit')) {
      const submission: ScoreSubmission = await req.json();

      if (!submission.initials || submission.score === undefined || !submission.gameSessionToken) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const initialsRegex = /^[A-Z]{1,3}$/;
      if (!initialsRegex.test(submission.initials)) {
        return new Response(
          JSON.stringify({ error: 'Invalid initials format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!isInitialsAppropriate(submission.initials)) {
        return new Response(
          JSON.stringify({ error: 'Please choose different initials' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const sessionValidation = validateSession(submission.gameSessionToken, submission.score);
      if (!sessionValidation.valid) {
        return new Response(
          JSON.stringify({ error: sessionValidation.error }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate score plausibility against level and time
      const plausibility = validateScorePlausibility(submission.score, submission.level, submission.timePlayedSeconds);
      if (!plausibility.valid) {
        return new Response(
          JSON.stringify({ error: plausibility.error }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reject submissions without a valid source
      const validSources = ['game_client'];
      const source = submission.source || 'unknown';
      if (!validSources.includes(source)) {
        return new Response(
          JSON.stringify({ error: 'Invalid submission source' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const session = sessionValidation.session!;

      const isDuplicate = await checkDuplicateScore(supabaseAdmin, submission.initials, submission.score);
      if (isDuplicate) {
        return new Response(
          JSON.stringify({ error: 'Duplicate score detected. This score was already submitted recently.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      session.submissionCount++;
      session.lastScore = submission.score;
      session.lastSubmissionTime = Date.now();

      const { error } = await supabaseAdmin
        .from('current_high_scores')
        .insert({
          initials: submission.initials,
          score: submission.score,
          session_token: submission.gameSessionToken,
          submission_method: 'edge_function',
          level: submission.level ?? 1,
          time_played_seconds: submission.timePlayedSeconds ?? 0,
          source: source,
        });

      if (error) {
        console.error('Database error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to save score' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Score submitted successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid endpoint' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
