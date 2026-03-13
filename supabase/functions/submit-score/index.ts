import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// CORS configuration - restrict to your application domain in production
// For development/testing, you can use '*' but for production, set VITE_APP_URL environment variable
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('VITE_APP_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScoreSubmission {
  initials: string;
  score: number;
  gameSessionToken: string;
  timestamp: number;
}

interface GameSession {
  token: string;
  startTime: number;
  lastScore: number;
  submissionCount: number;
  lastSubmissionTime: number;
}

// In-memory store for game sessions
// LIMITATION: This will reset on function cold starts (~15-30 minutes of inactivity)
// causing users to lose their session mid-game. For production with high traffic,
// consider implementing persistent storage:
// - Use a Supabase table with TTL/cleanup job
// - Use Redis for distributed caching
// - Use Deno KV for edge-native key-value storage
const gameSessions = new Map<string, GameSession>();

// Rate limiting configuration
const MAX_SUBMISSIONS_PER_SESSION = 10;
const SESSION_TIMEOUT = 3600000; // 1 hour
const MIN_SUBMISSION_INTERVAL = 5000; // 5 seconds between submissions

function generateSessionToken(): string {
  return crypto.randomUUID();
}

function validateSession(token: string, score: number): { valid: boolean; error?: string } {
  const session = gameSessions.get(token);
  
  if (!session) {
    return { valid: false, error: 'Invalid game session token' };
  }
  
  // Check session timeout
  if (Date.now() - session.startTime > SESSION_TIMEOUT) {
    gameSessions.delete(token);
    return { valid: false, error: 'Game session expired' };
  }
  
  // Check minimum interval between submissions
  const timeSinceLastSubmission = Date.now() - session.lastSubmissionTime;
  if (session.submissionCount > 0 && timeSinceLastSubmission < MIN_SUBMISSION_INTERVAL) {
    return { valid: false, error: 'Please wait before submitting another score' };
  }
  
  // Check submission count
  if (session.submissionCount >= MAX_SUBMISSIONS_PER_SESSION) {
    return { valid: false, error: 'Maximum submissions reached for this session' };
  }
  
  // Check score progression (score should be >= last score, allowing for game over and restart)
  // Allow score to be 0 or higher, but flag suspicious patterns
  if (score < 0 || score > 99999999) {
    return { valid: false, error: 'Invalid score range' };
  }
  
  return { valid: true };
}

async function checkDuplicateScore(
  supabaseAdmin: ReturnType<typeof createClient>,
  initials: string,
  score: number
): Promise<boolean> {
  // Check for duplicate score with same initials submitted recently (within last hour)
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create admin client for secure operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const url = new URL(req.url);
    
    // Endpoint to start a new game session
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
    
    // Endpoint to submit score
    if (url.pathname.endsWith('/submit')) {
      const submission: ScoreSubmission = await req.json();
      
      // Validate required fields
      if (!submission.initials || submission.score === undefined || !submission.gameSessionToken) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Validate initials format
      const initialsRegex = /^[A-Z]{1,3}$/;
      if (!initialsRegex.test(submission.initials)) {
        return new Response(
          JSON.stringify({ error: 'Invalid initials format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Validate session
      const sessionValidation = validateSession(submission.gameSessionToken, submission.score);
      if (!sessionValidation.valid) {
        return new Response(
          JSON.stringify({ error: sessionValidation.error }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check for duplicate scores
      const isDuplicate = await checkDuplicateScore(
        supabaseAdmin,
        submission.initials,
        submission.score
      );
      
      if (isDuplicate) {
        return new Response(
          JSON.stringify({ error: 'Duplicate score detected. This score was already submitted recently.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Update session tracking
      const session = gameSessions.get(submission.gameSessionToken)!;
      session.submissionCount++;
      session.lastScore = submission.score;
      session.lastSubmissionTime = Date.now();
      
      // Insert score using admin client
      const { error } = await supabaseAdmin
        .from('current_high_scores')
        .insert({
          initials: submission.initials,
          score: submission.score,
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
