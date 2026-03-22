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

interface FailedSubmissionDetails {
  initials?: string;
  score?: number;
  gameSessionToken?: string;
  clientTimestamp?: number;
  level?: number;
  timePlayedSeconds?: number;
  sessionAgeSeconds?: number;
  sessionSubmissionCount?: number;
  errorType: string;
  errorMessage: string;
  source?: string;
  rawSubmission?: ScoreSubmission;
  likelyValid: boolean;
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
  // Allow any origin in development, check in production
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

// Classify error types for the failed_submissions table
function classifyError(message: string): string {
  if (message.includes('session')) return 'session_error';
  if (message.includes('Score too high')) return 'plausibility_error';
  if (message.includes('Game duration')) return 'duration_error';
  if (message.includes('Duplicate')) return 'duplicate_error';
  if (message.includes('initials')) return 'initials_error';
  if (message.includes('Database')) return 'database_error';
  return 'validation_error';
}

// Log a failed submission to the failed_submissions table (best-effort)
async function logFailedSubmission(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  details: FailedSubmissionDetails,
): Promise<string | undefined> {
  try {
    const { data, error } = await supabaseAdmin.from('failed_submissions').insert({
      initials: details.initials ?? null,
      score: details.score ?? null,
      game_session_token: details.gameSessionToken ?? null,
      client_timestamp: details.clientTimestamp ?? null,
      level: details.level ?? null,
      time_played_seconds: details.timePlayedSeconds ?? null,
      session_age_seconds: details.sessionAgeSeconds ?? null,
      session_submission_count: details.sessionSubmissionCount ?? null,
      error_type: details.errorType,
      error_message: details.errorMessage,
      source: details.source ?? null,
      raw_submission: details.rawSubmission ?? null,
      likely_valid: details.likelyValid,
      email_sent: false,
    }).select('id').single();
    if (error) {
      console.error('Failed to log submission failure:', error);
      return undefined;
    }
    return data?.id as string | undefined;
  } catch (err) {
    console.error('Exception while logging failed submission:', err);
    return undefined;
  }
}

// Send an email notification for a failed submission via Resend
async function sendEmailNotification(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  details: FailedSubmissionDetails,
  failedSubmissionId?: string,
): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const notificationEmail = Deno.env.get('NOTIFICATION_EMAIL');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@georgeflower.dev';

  if (!resendApiKey || !notificationEmail) {
    console.log('Email notification skipped: RESEND_API_KEY or NOTIFICATION_EMAIL not configured');
    return;
  }

  const validityLabel = details.likelyValid ? '✅ Likely Valid' : '⚠️ Validity Uncertain';
  const timestamp = new Date().toISOString();

  const htmlBody = `
<h2>Asteroids – Failed Score Submission</h2>
<p><strong>Time:</strong> ${timestamp}</p>
<p><strong>Score Validity:</strong> ${validityLabel}</p>

<h3>Submission Details</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:monospace">
  <tr><td><strong>Initials</strong></td><td>${details.initials ?? 'N/A'}</td></tr>
  <tr><td><strong>Score</strong></td><td>${details.score ?? 'N/A'}</td></tr>
  <tr><td><strong>Level / Wave</strong></td><td>${details.level ?? 'N/A'}</td></tr>
  <tr><td><strong>Time Played (client)</strong></td><td>${details.timePlayedSeconds != null ? details.timePlayedSeconds + 's' : 'N/A'}</td></tr>
  <tr><td><strong>Session Age</strong></td><td>${details.sessionAgeSeconds != null ? details.sessionAgeSeconds + 's' : 'N/A'}</td></tr>
  <tr><td><strong>Session Submissions</strong></td><td>${details.sessionSubmissionCount ?? 'N/A'}</td></tr>
  <tr><td><strong>Session Token</strong></td><td style="font-size:0.85em">${details.gameSessionToken ?? 'N/A'}</td></tr>
  <tr><td><strong>Source</strong></td><td>${details.source ?? 'N/A'}</td></tr>
</table>

<h3>Error Information</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:monospace">
  <tr><td><strong>Error Type</strong></td><td>${details.errorType}</td></tr>
  <tr><td><strong>Error Message</strong></td><td>${details.errorMessage}</td></tr>
</table>

${details.likelyValid ? `
<h3>Action Required</h3>
<p>This score appears to be <strong>legitimate</strong> but failed due to a technical issue.
Consider manually adding it to the leaderboard using the Supabase dashboard with these values:</p>
<ul>
  <li><strong>initials:</strong> ${details.initials ?? 'N/A'}</li>
  <li><strong>score:</strong> ${details.score ?? 'N/A'}</li>
  <li><strong>level:</strong> ${details.level ?? 1}</li>
  <li><strong>time_played_seconds:</strong> ${details.timePlayedSeconds ?? 0}</li>
  <li><strong>source:</strong> manual_add</li>
</ul>
` : ''}

<p style="color:#888;font-size:0.85em">Failed Submission ID: ${failedSubmissionId ?? 'unknown'}</p>
`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [notificationEmail],
        subject: `[Asteroids] Failed submission: ${details.initials ?? '???'} scored ${details.score ?? '?'} – ${details.errorMessage}`,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('Resend API error:', res.status, body);
      return;
    }

    // Mark email as sent in the DB
    if (failedSubmissionId) {
      await supabaseAdmin
        .from('failed_submissions')
        .update({ email_sent: true })
        .eq('id', failedSubmissionId);
    }
  } catch (err) {
    console.error('Exception sending email notification:', err);
  }
}

// Log a failure and send an email notification (best-effort, non-blocking)
async function recordFailure(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  details: FailedSubmissionDetails,
): Promise<void> {
  // Fire-and-forget: do not block the caller (e.g., HTTP request handler)
  (async () => {
    try {
      const id = await logFailedSubmission(supabaseAdmin, details);
      await sendEmailNotification(supabaseAdmin, details, id);
    } catch (err) {
      console.error('Error while recording failure:', err);
    }
  })();
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

    // === START SESSION ===
    if (url.pathname.endsWith('/start-session')) {
      if (!validateOrigin(req)) {
        console.log('Origin rejected:', req.headers.get('origin'));
        return errorResponse('Forbidden', 403);
      }

      const token = crypto.randomUUID();

      // Clean up old sessions opportunistically
      try { await supabaseAdmin.rpc('cleanup_old_sessions'); } catch (_) { /* ignore */ }

      const { error } = await supabaseAdmin
        .from('game_sessions')
        .insert({ token });

      if (error) {
        console.error('Failed to create session:', error);
        return errorResponse('Failed to create session', 500);
      }

      return new Response(
        JSON.stringify({ sessionToken: token }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === SUBMIT SCORE ===
    if (url.pathname.endsWith('/submit')) {
      if (!validateOrigin(req)) {
        console.log('Origin rejected on submit:', req.headers.get('origin'));
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

      // Reject submissions without a valid source
      const validSources = ['game_client'];
      const source = submission.source || 'unknown';
      if (!validSources.includes(source)) {
        return errorResponse('Invalid submission source', 403);
      }

      // --- Validate session from DATABASE (not memory) ---
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('game_sessions')
        .select('*')
        .eq('token', submission.gameSessionToken)
        .single();

      if (sessionError || !session) {
        console.log('Session not found:', submission.gameSessionToken);
        const msg = 'Invalid game session token';
        await recordFailure(supabaseAdmin, {
          initials: submission.initials,
          score: submission.score,
          gameSessionToken: submission.gameSessionToken,
          clientTimestamp: submission.timestamp,
          level: submission.level,
          timePlayedSeconds: submission.timePlayedSeconds,
          errorType: classifyError(msg),
          errorMessage: msg,
          source,
          rawSubmission: submission,
          likelyValid: true,
        });
        return errorResponse(msg, 403);
      }

      const sessionAgeMs = Date.now() - new Date(session.started_at).getTime();
      const sessionAgeSeconds = Math.floor(sessionAgeMs / 1000);

      if (session.expired) {
        const msg = 'Game session expired';
        await recordFailure(supabaseAdmin, {
          initials: submission.initials,
          score: submission.score,
          gameSessionToken: submission.gameSessionToken,
          clientTimestamp: submission.timestamp,
          level: submission.level,
          timePlayedSeconds: submission.timePlayedSeconds,
          sessionAgeSeconds,
          sessionSubmissionCount: session.submission_count,
          errorType: classifyError(msg),
          errorMessage: msg,
          source,
          rawSubmission: submission,
          likelyValid: true,
        });
        return errorResponse(msg, 403);
      }

      // Check session timeout using DB server time
      if (sessionAgeMs > SESSION_TIMEOUT_MS) {
        await supabaseAdmin
          .from('game_sessions')
          .update({ expired: true })
          .eq('id', session.id);
        const msg = 'Game session expired';
        await recordFailure(supabaseAdmin, {
          initials: submission.initials,
          score: submission.score,
          gameSessionToken: submission.gameSessionToken,
          clientTimestamp: submission.timestamp,
          level: submission.level,
          timePlayedSeconds: submission.timePlayedSeconds,
          sessionAgeSeconds,
          sessionSubmissionCount: session.submission_count,
          errorType: classifyError(msg),
          errorMessage: msg,
          source,
          rawSubmission: submission,
          likelyValid: true,
        });
        return errorResponse(msg, 403);
      }

      // Rate limiting
      if (session.submission_count >= MAX_SUBMISSIONS_PER_SESSION) {
        const msg = 'Maximum submissions reached for this session';
        await recordFailure(supabaseAdmin, {
          initials: submission.initials,
          score: submission.score,
          gameSessionToken: submission.gameSessionToken,
          clientTimestamp: submission.timestamp,
          level: submission.level,
          timePlayedSeconds: submission.timePlayedSeconds,
          sessionAgeSeconds,
          sessionSubmissionCount: session.submission_count,
          errorType: classifyError(msg),
          errorMessage: msg,
          source,
          rawSubmission: submission,
          likelyValid: true,
        });
        return errorResponse(msg, 403);
      }

      if (session.last_submission_at) {
        const timeSinceLast = Date.now() - new Date(session.last_submission_at).getTime();
        if (timeSinceLast < MIN_SUBMISSION_INTERVAL_MS) {
          return errorResponse('Please wait before submitting another score', 403);
        }
      }

      // --- Score plausibility using SERVER time (unforgeable) ---
      const serverTimePlayedSeconds = Math.floor(sessionAgeMs / 1000);

      if (serverTimePlayedSeconds < MIN_PLAY_TIME_SECONDS) {
        const msg = 'Game duration too short';
        await recordFailure(supabaseAdmin, {
          initials: submission.initials,
          score: submission.score,
          gameSessionToken: submission.gameSessionToken,
          clientTimestamp: submission.timestamp,
          level: submission.level,
          timePlayedSeconds: submission.timePlayedSeconds,
          sessionAgeSeconds,
          sessionSubmissionCount: session.submission_count,
          errorType: classifyError(msg),
          errorMessage: msg,
          source,
          rawSubmission: submission,
          likelyValid: false,
        });
        return errorResponse(msg, 403);
      }

      const maxScoreForTime = serverTimePlayedSeconds * MAX_SCORE_PER_SECOND;
      if (submission.score > maxScoreForTime) {
        const msg = 'Score too high for game duration';
        console.log(`Plausibility fail: score=${submission.score}, time=${serverTimePlayedSeconds}s, max=${maxScoreForTime}`);
        await recordFailure(supabaseAdmin, {
          initials: submission.initials,
          score: submission.score,
          gameSessionToken: submission.gameSessionToken,
          clientTimestamp: submission.timestamp,
          level: submission.level,
          timePlayedSeconds: submission.timePlayedSeconds,
          sessionAgeSeconds,
          sessionSubmissionCount: session.submission_count,
          errorType: classifyError(msg),
          errorMessage: msg,
          source,
          rawSubmission: submission,
          likelyValid: false,
        });
        return errorResponse(msg, 403);
      }

      if (submission.level !== undefined && submission.level !== null) {
        if (submission.level < 1 || submission.level > MAX_LEVEL) {
          return errorResponse('Invalid level value', 403);
        }
        const maxScoreForLevel = submission.level * MAX_SCORE_PER_LEVEL;
        if (submission.score > maxScoreForLevel) {
          const msg = 'Score too high for reported level';
          console.log(`Plausibility fail: score=${submission.score}, level=${submission.level}, max=${maxScoreForLevel}`);
          await recordFailure(supabaseAdmin, {
            initials: submission.initials,
            score: submission.score,
            gameSessionToken: submission.gameSessionToken,
            clientTimestamp: submission.timestamp,
            level: submission.level,
            timePlayedSeconds: submission.timePlayedSeconds,
            sessionAgeSeconds,
            sessionSubmissionCount: session.submission_count,
            errorType: classifyError(msg),
            errorMessage: msg,
            source,
            rawSubmission: submission,
            likelyValid: false,
          });
          return errorResponse(msg, 403);
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

      // --- Insert score + audit log atomically ---
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
        const msg = 'Database error saving score';
        console.error('Database error:', insertError);
        await recordFailure(supabaseAdmin, {
          initials: submission.initials,
          score: submission.score,
          gameSessionToken: submission.gameSessionToken,
          clientTimestamp: submission.timestamp,
          level: submission.level,
          timePlayedSeconds: submission.timePlayedSeconds,
          sessionAgeSeconds,
          sessionSubmissionCount: session.submission_count,
          errorType: 'database_error',
          errorMessage: msg,
          source,
          rawSubmission: submission,
          likelyValid: true,
        });
        return errorResponse('Failed to save score', 500);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Score submitted successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return errorResponse('Invalid endpoint', 404);
  } catch (error) {
    console.error('Error:', error);
    return errorResponse('Internal server error', 500);
  }
});
