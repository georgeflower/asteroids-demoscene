import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-admin-key',
};
const ALLOWED_ORIGINS = [
  'https://asteroids-demoscene.lovable.app',
  'https://id-preview--b6edd2f4-8993-4a05-a257-466f1a773f73.lovable.app',
  'https://b6edd2f4-8993-4a05-a257-466f1a773f73.lovableproject.com',
];

function getAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin') || '';
  if (ALLOWED_ORIGINS.length === 0) return origin || '*';
  const matched = ALLOWED_ORIGINS.find(allowed => origin.startsWith(allowed));
  return matched ? origin : null;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOrigin = getAllowedOrigin(req);
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': allowedOrigin ?? '',
  };
}

interface ScoreSubmission {
  initials: string;
  score: number;
  gameSessionToken?: string;
  k?: string;
  timestamp: number;
  level?: number;
  timePlayedSeconds?: number;
  source?: string;
  powNonce?: number;
  S?: number;
  hmac?: string;
  asteroidsDestroyed?: number;
  bulletsFired?: number;
  seq?: number;
}

interface HeartbeatPayload {
  gameSessionToken?: string;
  k?: string;
  score: number;
  level: number;
  asteroidsDestroyed?: number;
  bulletsFired?: number;
  l?: number;
  u?: number;
  hmac?: string;
  seq?: number;
}

// --- Constants ---
const MAX_SUBMISSIONS_PER_SESSION = 1;
const SESSION_TIMEOUT_MS = 3600000; // 1 hour
const MIN_SUBMISSION_INTERVAL_MS = 5000;
const MAX_VALID_SCORE = 9999999;
const MAX_SCORE_PER_SECOND = 10000;        // HARD ceiling (physical max with x10 multiplier)
const MAX_SCORE_PER_LEVEL = 400000;        // HARD ceiling
const MAX_LEVEL = 100;
const MIN_PLAY_TIME_SECONDS = 10;
const MAX_CHECKPOINT_GAP_SECONDS = 90; // flag only (players pause)
const MAX_SCORE_JUMP_PER_SECOND = 10000;   // HARD ceiling
const MAX_LEVEL_JUMP = 5;
const HIGH_SCORE_DURATION_THRESHOLD = 50000;
const MAX_CHECKPOINT_SPAN_RATIO = 0.15;
const MAX_CHECKPOINT_START_RATIO = 0.10;
const POW_DIFFICULTY = 18;

// Delta validation thresholds (per second)
const MAX_ASTEROIDS_PER_SEC = 12;
const MAX_BULLETS_PER_SEC = 14;            // rapid fire is exactly 10/s; leave jitter room
const MIN_HEARTBEAT_GAP_MS = 5000; // Absolute minimum between heartbeats
const MAX_HEARTBEATS_PER_MINUTE = 6; // Client sends every ~30s

// Soft thresholds: flag, never reject
const SCORE_BURST_ALLOWANCE = 100000;   // one late-wave boss kill is up to 80,000 with x10
const SOFT_SCORE_PER_SECOND = 2500;     // flag, never reject
const SOFT_SCORE_PER_LEVEL = 150000;    // flag, never reject
const SOFT_FINAL_JUMP_MIN = 60000;      // flag, never reject
const SHORT_HIGH_SCORE_SECONDS = 120;   // flag, never reject
const MAX_FLAGS_PER_SESSION = 20;

type Flag = { flag_type: string; severity: 'low' | 'medium' | 'high'; reasoning: string };

function addFlag(list: Flag[], f: Flag) {
  if (list.length >= MAX_FLAGS_PER_SESSION) return;
  if (list.some((x) => x.flag_type === f.flag_type)) return;
  list.push(f);
}

function validateOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') || '';
  const referer = req.headers.get('referer') || '';
  if (ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.some(allowed =>
    origin.startsWith(allowed) || referer.startsWith(allowed)
  );
}

function errorResponse(message: string, status: number, code?: string) {
  return new Response(
    JSON.stringify({ error: message, code }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function reject(
  supabaseAdmin: any,
  req: Request,
  submission: { gameSessionToken?: string; initials?: string; score?: number; level?: number },
  code: string,
  message: string,
  status: number,
  detail: Record<string, unknown> = {},
) {
  try {
    await supabaseAdmin.from('rejected_submissions').insert({
      session_token: submission.gameSessionToken ?? null,
      initials: typeof submission.initials === 'string' ? submission.initials.slice(0, 3) : null,
      score: Number.isInteger(submission.score) ? submission.score : null,
      level: Number.isInteger(submission.level) ? submission.level : null,
      code,
      message,
      detail,
      origin: req.headers.get('origin'),
      user_agent: req.headers.get('user-agent'),
    });
  } catch (_) { /* best effort */ }
  return errorResponse(message, status, code);
}

function successResponse(data: Record<string, unknown>) {
  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// --- Crypto helpers ---

async function verifyPoW(challenge: string, nonce: number, difficulty: number): Promise<boolean> {
  const data = new TextEncoder().encode(challenge + nonce.toString());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  let zeroBits = 0;
  for (const byte of hashArray) {
    if (byte === 0) {
      zeroBits += 8;
    } else {
      for (let bit = 7; bit >= 0; bit--) {
        if ((byte & (1 << bit)) === 0) {
          zeroBits++;
        } else {
          return zeroBits >= difficulty;
        }
      }
    }
    if (zeroBits >= difficulty) return true;
  }
  return zeroBits >= difficulty;
}

async function computeHMAC(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifyHMAC(key: string, message: string, expectedHmac: string): Promise<boolean> {
  const computed = await computeHMAC(key, message);
  return timingSafeEqual(computed, expectedHmac);
}

// Verify HMAC with backward compatibility: try V2 (with seq) first, then V1 (without)
async function verifyHMACCompat(
  key: string, token: string, score: number, level: number,
  asteroids: number, bullets: number, seq: number | undefined, provided: string
): Promise<boolean> {
  // V2: includes seq
  const msgV2 = `${token}|${score}|${level}|${asteroids}|${bullets}|${seq ?? 0}`;
  const computedV2 = await computeHMAC(key, msgV2);
  if (timingSafeEqual(computedV2, provided)) return true;

  // V1 fallback: no seq (backward compat for older clients)
  const msgV1 = `${token}|${score}|${level}|${asteroids}|${bullets}`;
  const computedV1 = await computeHMAC(key, msgV1);
  return timingSafeEqual(computedV1, provided);
}

// --- Handlers ---

async function handleStartSession(req: Request, supabaseAdmin: any) {
  if (!validateOrigin(req)) {
    return errorResponse('Forbidden', 403);
  }

  const token = crypto.randomUUID();
  const challenge = crypto.randomUUID() + crypto.randomUUID();
  const sessionNonce = crypto.randomUUID();
  const difficulty = POW_DIFFICULTY;

  try { await supabaseAdmin.rpc('cleanup_old_sessions'); } catch (_) { /* ignore */ }

  const { error } = await supabaseAdmin.from('game_sessions').insert({
    token,
    pow_challenge: challenge,
    pow_difficulty: difficulty,
    session_nonce: sessionNonce,
    // Initialize server-authoritative state
    last_seq: 0,
    last_score: 0,
    last_level: 1,
    last_asteroids: 0,
    last_bullets: 0,
    heartbeat_count_minute: 0,
  });
  if (error) {
    console.error('Failed to create session:', error);
    return errorResponse('Failed to create session', 500);
  }

  return successResponse({
    sessionToken: token,
    challenge,
    difficulty,
    sessionNonce,
  });
}

async function handleHeartbeat(req: Request, supabaseAdmin: any) {
  if (!validateOrigin(req)) {
    return errorResponse('Forbidden', 403);
  }

  const rawPayload: HeartbeatPayload = await req.json();

  // Robust field-name parsing (accept both minified and full names)
  const token = rawPayload.gameSessionToken ?? rawPayload.k;
  const ast = rawPayload.asteroidsDestroyed ?? rawPayload.l ?? 0;
  const bul = rawPayload.bulletsFired ?? rawPayload.u ?? 0;
  const payload = {
    token,
    score: rawPayload.score,
    level: rawPayload.level,
    asteroidsDestroyed: ast,
    bulletsFired: bul,
    hmac: rawPayload.hmac,
    seq: rawPayload.seq,
  };

  if (!payload.token || payload.score === undefined || payload.level === undefined) {
    return errorResponse('Missing required fields', 400);
  }

  // Strictly require seq
  if (payload.seq === undefined || payload.seq === null) {
    return errorResponse('Missing seq', 400);
  }

  if (payload.score < 0 || payload.score > MAX_VALID_SCORE) {
    return errorResponse('Invalid score', 400);
  }

  if (payload.level < 1 || payload.level > MAX_LEVEL) {
    return errorResponse('Invalid level', 400);
  }

  // Fetch session with server-authoritative state
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('game_sessions')
    .select('*')
    .eq('token', payload.token)
    .single();

  if (sessionError || !session) {
    return errorResponse('Invalid session', 403);
  }

  if (session.expired) {
    return errorResponse('Session expired', 403);
  }

  const now = Date.now();
  const sessionFlags: Flag[] = Array.isArray(session.flags) ? [...session.flags] : [];

  // --- HMAC verification (with seq, backward-compat) ---
  if (session.session_nonce) {
    if (!payload.hmac) {
      return errorResponse('Missing signature', 400);
    }
    const valid = await verifyHMACCompat(
      session.session_nonce, payload.token, payload.score, payload.level,
      payload.asteroidsDestroyed, payload.bulletsFired, payload.seq, payload.hmac
    );
    if (!valid) {
      console.log(`HMAC verification failed for heartbeat: token=${payload.token}`);
      return errorResponse('Invalid signature', 403);
    }
  }

  // --- Sequence validation (strict) ---
  const lastSeq = session.last_seq ?? 0;
  if (payload.seq <= lastSeq) {
    console.log(`Seq replay detected: got seq=${payload.seq}, last was ${lastSeq}`);
    return errorResponse('Replay detected', 403);
  }

  // --- Timing validation ---
  const lastHeartbeatAt = session.last_heartbeat_at ? new Date(session.last_heartbeat_at).getTime() : null;

  if (lastHeartbeatAt !== null) {
    const timeSinceLast = now - lastHeartbeatAt;

    // Absolute minimum gap
    if (timeSinceLast < MIN_HEARTBEAT_GAP_MS) {
      return errorResponse('Too frequent', 429);
    }

    // --- Per-minute rate limiting ---
    const windowStart = session.heartbeat_window_start ? new Date(session.heartbeat_window_start).getTime() : null;
    let countThisMinute = session.heartbeat_count_minute ?? 0;
    let newWindowStart = windowStart;

    if (windowStart && (now - windowStart) < 60000) {
      // Still within the same minute window
      countThisMinute++;
      if (countThisMinute > MAX_HEARTBEATS_PER_MINUTE) {
        console.log(`Rate limit exceeded: ${countThisMinute} heartbeats in current minute window, token=${payload.token}`);
        return errorResponse('Rate limit exceeded', 429);
      }
    } else {
      // Start a new minute window
      countThisMinute = 1;
      newWindowStart = now;
    }

    // --- Delta validation (the core anti-cheat) ---
    const dtSec = (now - lastHeartbeatAt) / 1000;
    const lastScore = session.last_score ?? 0;
    const lastAsteroids = session.last_asteroids ?? 0;
    const lastBullets = session.last_bullets ?? 0;
    const lastLevel = session.last_level ?? 1;

    const scoreDelta = payload.score - lastScore;
    const asteroidsDelta = (payload.asteroidsDestroyed ?? 0) - lastAsteroids;
    const bulletsDelta = (payload.bulletsFired ?? 0) - lastBullets;
    const levelDelta = payload.level - lastLevel;

    // Score cannot decrease
    if (scoreDelta < 0) {
      console.log(`Score decreased: ${payload.score} < ${lastScore}, token=${payload.token}`);
      return errorResponse('Invalid score progression', 400);
    }

    // Score delta must be plausible for elapsed time
    const hardMax = MAX_SCORE_JUMP_PER_SECOND * dtSec + SCORE_BURST_ALLOWANCE;
    if (scoreDelta > hardMax) {
      console.log(`Score delta too high: +${scoreDelta} in ${dtSec.toFixed(1)}s (max ${hardMax.toFixed(0)}), token=${payload.token}`);
      return errorResponse('Score progression anomaly', 403);
    }
    const softMax = SOFT_SCORE_PER_SECOND * dtSec + SCORE_BURST_ALLOWANCE;
    if (scoreDelta > softMax) {
      addFlag(sessionFlags, {
        flag_type: 'heartbeat_score_rate',
        severity: 'medium',
        reasoning: `Heartbeat score delta +${scoreDelta} in ${dtSec.toFixed(1)}s exceeds soft limit ${softMax.toFixed(0)}`,
      });
    }

    // Asteroids cannot decrease
    if (asteroidsDelta < 0) {
      return errorResponse('Invalid metric progression', 400);
    }
    // Asteroids delta must be plausible
    const maxAsteroidsDelta = MAX_ASTEROIDS_PER_SEC * dtSec + 20;
    if (asteroidsDelta > maxAsteroidsDelta) {
      console.log(`Asteroids delta too high: +${asteroidsDelta} in ${dtSec.toFixed(1)}s (max ${maxAsteroidsDelta.toFixed(0)}), token=${payload.token}`);
      return errorResponse('Metric progression anomaly', 403);
    }

    // Bullets cannot decrease
    if (bulletsDelta < 0) {
      return errorResponse('Invalid metric progression', 400);
    }
    // Bullets delta must be plausible
    const maxBulletsDelta = MAX_BULLETS_PER_SEC * dtSec + 20;
    if (bulletsDelta > maxBulletsDelta) {
      console.log(`Bullets delta too high: +${bulletsDelta} in ${dtSec.toFixed(1)}s (max ${maxBulletsDelta.toFixed(0)}), token=${payload.token}`);
      return errorResponse('Metric progression anomaly', 403);
    }

    // Level cannot decrease; max jump limited
    if (levelDelta < 0) {
      return errorResponse('Invalid level progression', 400);
    }
    if (levelDelta > MAX_LEVEL_JUMP) {
      console.log(`Level jump too large: +${levelDelta}, token=${payload.token}`);
      return errorResponse('Impossible wave progression', 403);
    }

    // --- CAS update: atomic session state mutation ---
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('game_sessions')
      .update({
        last_heartbeat_at: new Date(now).toISOString(),
        last_seq: payload.seq,
        last_score: payload.score,
        last_level: payload.level,
        last_asteroids: payload.asteroidsDestroyed,
        last_bullets: payload.bulletsFired,
        heartbeat_count_minute: countThisMinute,
        heartbeat_window_start: newWindowStart ? new Date(newWindowStart).toISOString() : new Date(now).toISOString(),
        flags: sessionFlags,
      })
      .eq('token', payload.token)
      .eq('last_seq', lastSeq)  // CAS guard
      .select('token');

    if (updateError) {
      console.error('Failed to update session state:', updateError);
      return errorResponse('Failed to update session state', 500);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return errorResponse('Out-of-order heartbeat', 409);
    }
  } else {
    // First heartbeat — CAS guard with last_seq = 0
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('game_sessions')
      .update({
        last_heartbeat_at: new Date(now).toISOString(),
        last_seq: payload.seq,
        last_score: payload.score,
        last_level: payload.level,
        last_asteroids: payload.asteroidsDestroyed,
        last_bullets: payload.bulletsFired,
        heartbeat_count_minute: 1,
        heartbeat_window_start: new Date(now).toISOString(),
        flags: sessionFlags,
      })
      .eq('token', payload.token)
      .eq('last_seq', 0)  // CAS guard for first heartbeat
      .select('token');

    if (updateError) {
      console.error('Failed to update session state:', updateError);
      return errorResponse('Failed to update session state', 500);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return errorResponse('Out-of-order heartbeat', 409);
    }
  }

  // Still insert checkpoint for audit trail
  const { error: insertError } = await supabaseAdmin
    .from('game_session_checkpoints')
    .insert({
      session_token: payload.token,
      score: payload.score,
      level: payload.level,
      asteroids_destroyed: payload.asteroidsDestroyed,
      bullets_fired: payload.bulletsFired,
      seq: payload.seq,
    });

  if (insertError) {
    console.error('Failed to insert checkpoint:', insertError);
    return errorResponse('Failed to save checkpoint', 500);
  }

  // Burst detection on 5+ checkpoints
  const { data: allCheckpoints } = await supabaseAdmin
    .from('game_session_checkpoints')
    .select('reported_at')
    .eq('session_token', payload.token)
    .order('reported_at', { ascending: true });

  if (allCheckpoints && allCheckpoints.length >= 5) {
    const intervals: number[] = [];
    for (let i = 1; i < allCheckpoints.length; i++) {
      const gap = new Date(allCheckpoints[i].reported_at).getTime() - new Date(allCheckpoints[i - 1].reported_at).getTime();
      intervals.push(gap);
    }
    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const intervalVariance = intervals.reduce((sum, g) => sum + (g - meanInterval) ** 2, 0) / intervals.length;
    const intervalStdDev = Math.sqrt(intervalVariance);
    if (intervalStdDev < 500 && meanInterval < 15000) {
      const before = sessionFlags.length;
      addFlag(sessionFlags, {
        flag_type: 'regular_timing',
        severity: 'low',
        reasoning: `Heartbeat intervals unusually regular: stdDev=${intervalStdDev.toFixed(0)}ms, mean=${meanInterval.toFixed(0)}ms`,
      });
      if (sessionFlags.length > before) {
        await supabaseAdmin.from('game_sessions').update({ flags: sessionFlags }).eq('token', payload.token);
      }
    }
  }

  return successResponse({ ok: true, accepted: true });
}

async function handleSubmit(req: Request, supabaseAdmin: any) {
  if (!validateOrigin(req)) {
    return errorResponse('Forbidden', 403);
  }

  const rawSubmission: ScoreSubmission = await req.json();

  // Robust field-name parsing
  const sessionToken = rawSubmission.gameSessionToken ?? rawSubmission.k;
  const powNonce = rawSubmission.powNonce ?? rawSubmission.S;
  const submission = { ...rawSubmission, gameSessionToken: sessionToken, powNonce };

  // --- Basic field validation ---
  if (!submission.initials || submission.score === undefined || !sessionToken) {
    return errorResponse('Missing required fields', 400);
  }

  const initialsRegex = /^[A-Z]{1,3}$/;
  if (!initialsRegex.test(submission.initials)) {
    return errorResponse('Invalid initials format', 400);
  }

  if (submission.score < 0 || submission.score > MAX_VALID_SCORE) {
    return errorResponse('Invalid score range', 400);
  }

  if (!Number.isInteger(submission.score)) {
    return reject(supabaseAdmin, req, submission, 'SCORE_NOT_INTEGER', 'Invalid score range', 400);
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
    return reject(supabaseAdmin, req, submission, 'SESSION_INVALID', 'Invalid game session token', 403);
  }

  if (session.expired) {
    return reject(supabaseAdmin, req, submission, 'SESSION_EXPIRED', 'Game session expired', 403);
  }

  const sessionAge = Date.now() - new Date(session.started_at).getTime();
  if (sessionAge > SESSION_TIMEOUT_MS) {
    await supabaseAdmin
      .from('game_sessions')
      .update({ expired: true })
      .eq('id', session.id);
    return reject(supabaseAdmin, req, submission, 'SESSION_TIMEOUT', 'Game session expired', 403, { sessionAgeMs: sessionAge });
  }

  if (session.submission_count >= MAX_SUBMISSIONS_PER_SESSION) {
    return reject(supabaseAdmin, req, submission, 'MAX_SUBMISSIONS', 'Maximum submissions reached for this session', 403);
  }

  if (session.last_submission_at) {
    const timeSinceLast = Date.now() - new Date(session.last_submission_at).getTime();
    if (timeSinceLast < MIN_SUBMISSION_INTERVAL_MS) {
      return reject(supabaseAdmin, req, submission, 'TOO_SOON', 'Please wait before submitting another score', 403);
    }
  }

  // --- Require at least 1 heartbeat ---
  if (!session.last_heartbeat_at) {
    return reject(supabaseAdmin, req, submission, 'NO_HEARTBEAT', 'Insufficient gameplay data', 403);
  }

  // --- Proof-of-Work verification ---
  if (session.pow_challenge && session.pow_difficulty) {
    if (submission.powNonce === undefined || submission.powNonce === null) {
      return reject(supabaseAdmin, req, submission, 'POW_MISSING', 'Missing proof-of-work solution', 403);
    }
    const powValid = await verifyPoW(session.pow_challenge, submission.powNonce, session.pow_difficulty);
    if (!powValid) {
      return reject(supabaseAdmin, req, submission, 'POW_INVALID', 'Invalid proof-of-work solution', 403);
    }
  }

  // --- HMAC verification (with backward compat) ---
  if (session.session_nonce) {
    if (!submission.hmac) {
      return reject(supabaseAdmin, req, submission, 'HMAC_MISSING', 'Missing signature', 400);
    }
    const submittedAsteroids = submission.asteroidsDestroyed ?? 0;
    const submittedBullets = submission.bulletsFired ?? 0;
    const seqForHmac = submission.seq ?? session.last_seq ?? 0;
    const valid = await verifyHMACCompat(
      session.session_nonce, sessionToken!, submission.score, submission.level ?? 1,
      submittedAsteroids, submittedBullets, seqForHmac, submission.hmac
    );
    if (!valid) {
      console.log(`HMAC verification failed for submit: token=${sessionToken}, score=${submission.score}, level=${submission.level ?? 1}, seq=${seqForHmac}`);
      return reject(supabaseAdmin, req, submission, 'HMAC', 'Invalid signature', 403);
    }
  }

  const suspiciousFlags: Flag[] = [];
  const level = submission.level ?? 1;
  const serverTimePlayedSeconds = Math.floor(sessionAge / 1000);
  const lastScore = session.last_score ?? 0;
  const lastHeartbeatAt = new Date(session.last_heartbeat_at).getTime();
  const dtSinceLastHeartbeat = Math.max(0, (Date.now() - lastHeartbeatAt) / 1000);
  const baseDetail = {
    score: submission.score,
    level,
    serverTimePlayedSeconds,
    lastScore,
    dtSinceLastHeartbeat: Math.round(dtSinceLastHeartbeat),
  };

  // --- Plausibility: HARD limits ---
  if (serverTimePlayedSeconds < MIN_PLAY_TIME_SECONDS) {
    return reject(supabaseAdmin, req, submission, 'TOO_SHORT', 'Game duration too short', 403, baseDetail);
  }

  if (submission.score > serverTimePlayedSeconds * MAX_SCORE_PER_SECOND + SCORE_BURST_ALLOWANCE) {
    return reject(supabaseAdmin, req, submission, 'TIME_CAP', 'Score too high for game duration', 403, baseDetail);
  }

  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    return reject(supabaseAdmin, req, submission, 'LEVEL_RANGE', 'Invalid level value', 403, baseDetail);
  }
  if (submission.score > level * MAX_SCORE_PER_LEVEL) {
    return reject(supabaseAdmin, req, submission, 'LEVEL_CAP', 'Score too high for reported level', 403, baseDetail);
  }

  // --- Plausibility: SOFT flags ---
  if (submission.score > serverTimePlayedSeconds * SOFT_SCORE_PER_SECOND + SCORE_BURST_ALLOWANCE) {
    addFlag(suspiciousFlags, { flag_type: 'high_score_rate', severity: 'medium', reasoning: `Score ${submission.score} in ${serverTimePlayedSeconds}s exceeds soft rate` });
  }
  if (submission.score > level * SOFT_SCORE_PER_LEVEL) {
    addFlag(suspiciousFlags, { flag_type: 'score_vs_wave', severity: 'medium', reasoning: `Score ${submission.score} at wave ${level} exceeds soft per-wave limit` });
  }
  if (submission.score >= HIGH_SCORE_DURATION_THRESHOLD && serverTimePlayedSeconds < SHORT_HIGH_SCORE_SECONDS) {
    addFlag(suspiciousFlags, { flag_type: 'short_high_score', severity: 'medium', reasoning: `Score ${submission.score} after only ${serverTimePlayedSeconds}s` });
  }
  if (level === 1 && submission.score > 40000) {
    addFlag(suspiciousFlags, { flag_type: 'level1_high_score', severity: 'medium', reasoning: `Score ${submission.score} at wave 1` });
  }

  // --- Final score vs server-authoritative last_score ---
  if (submission.score > lastScore + dtSinceLastHeartbeat * MAX_SCORE_JUMP_PER_SECOND + SCORE_BURST_ALLOWANCE) {
    return reject(supabaseAdmin, req, submission, 'FINAL_SCORE', 'Final score anomaly', 403, baseDetail);
  }
  if (submission.score > lastScore + Math.max(SOFT_FINAL_JUMP_MIN, dtSinceLastHeartbeat * SOFT_SCORE_PER_SECOND)) {
    addFlag(suspiciousFlags, { flag_type: 'final_score_jump', severity: 'medium', reasoning: `Final score +${submission.score - lastScore} over last heartbeat after ${dtSinceLastHeartbeat.toFixed(0)}s` });
  }

  // --- Checkpoint analysis (always loaded) ---
  const { data: checkpoints, error: cpError } = await supabaseAdmin
    .from('game_session_checkpoints')
    .select('*')
    .eq('session_token', submission.gameSessionToken)
    .order('reported_at', { ascending: true });

  if (cpError) {
    console.error('Failed to query checkpoints:', cpError);
    return errorResponse('Validation error', 500);
  }
  const cps: any[] = checkpoints ?? [];
  const cpDetail = { ...baseDetail, checkpoints: cps.length };

  if (cps.length === 0) {
    return reject(supabaseAdmin, req, submission, 'NO_HEARTBEAT', 'Insufficient gameplay data', 403, cpDetail);
  }

  let consecutiveDuplicateScores = 0;
  let consecutiveStagnantAsteroids = 0;
  let consecutiveStagnantBullets = 0;

  for (let i = 1; i < cps.length; i++) {
    const prev = cps[i - 1];
    const curr = cps[i];
    const gapSeconds = (new Date(curr.reported_at).getTime() - new Date(prev.reported_at).getTime()) / 1000;

    if (gapSeconds > MAX_CHECKPOINT_GAP_SECONDS) {
      addFlag(suspiciousFlags, { flag_type: 'checkpoint_gap', severity: 'low', reasoning: `${gapSeconds.toFixed(0)}s gap between checkpoints ${i - 1} and ${i}` });
    }

    const levelJump = curr.level - prev.level;
    if (levelJump > MAX_LEVEL_JUMP || levelJump < 0) {
      return reject(supabaseAdmin, req, submission, 'CHECKPOINT_LEVEL', 'Impossible wave progression detected', 403, { ...cpDetail, index: i, levelJump });
    }

    const scoreDelta = curr.score - prev.score;
    if (scoreDelta > gapSeconds * MAX_SCORE_JUMP_PER_SECOND + SCORE_BURST_ALLOWANCE) {
      return reject(supabaseAdmin, req, submission, 'CHECKPOINT_SCORE', 'Score progression anomaly', 403, { ...cpDetail, index: i, scoreDelta, gapSeconds });
    }
    if (scoreDelta > gapSeconds * SOFT_SCORE_PER_SECOND + SCORE_BURST_ALLOWANCE) {
      addFlag(suspiciousFlags, { flag_type: 'checkpoint_score_rate', severity: 'medium', reasoning: `+${scoreDelta} in ${gapSeconds.toFixed(0)}s between checkpoints ${i - 1} and ${i}` });
    }

    if (curr.asteroids_destroyed < prev.asteroids_destroyed || curr.bullets_fired < prev.bullets_fired) {
      return reject(supabaseAdmin, req, submission, 'CHECKPOINT_MONOTONIC', 'Invalid metric progression in checkpoints', 403, { ...cpDetail, index: i });
    }

    consecutiveDuplicateScores = curr.score === prev.score && curr.score > 0 ? consecutiveDuplicateScores + 1 : 0;
    consecutiveStagnantAsteroids = curr.asteroids_destroyed === prev.asteroids_destroyed && scoreDelta > 0 ? consecutiveStagnantAsteroids + 1 : 0;
    consecutiveStagnantBullets = curr.bullets_fired === prev.bullets_fired && scoreDelta > 0 ? consecutiveStagnantBullets + 1 : 0;

    if (consecutiveDuplicateScores >= 3) {
      addFlag(suspiciousFlags, { flag_type: 'duplicate_score_sequence', severity: 'high', reasoning: `Score ${curr.score} unchanged for ${consecutiveDuplicateScores + 1} consecutive heartbeats` });
    }
    if (consecutiveStagnantAsteroids >= 2) {
      addFlag(suspiciousFlags, { flag_type: 'stagnant_asteroids', severity: 'medium', reasoning: `asteroids_destroyed stuck at ${curr.asteroids_destroyed} for ${consecutiveStagnantAsteroids + 1} heartbeats while score increased` });
    }
    if (consecutiveStagnantBullets >= 2) {
      addFlag(suspiciousFlags, { flag_type: 'stagnant_bullets', severity: 'medium', reasoning: `bullets_fired stuck at ${curr.bullets_fired} for ${consecutiveStagnantBullets + 1} heartbeats while score increased` });
    }
  }

  if (serverTimePlayedSeconds >= 180 && cps.length < Math.floor(serverTimePlayedSeconds / 90)) {
    addFlag(suspiciousFlags, { flag_type: 'sparse_checkpoints', severity: 'medium', reasoning: `Only ${cps.length} checkpoints in ${serverTimePlayedSeconds}s` });
  }

  // Cross-session fingerprint detection (hard: replay of another session)
  if (cps.length >= 4 && cps.some((cp) => cp.score > 0)) {
    const cpFingerprint = cps.map((cp) => cp.score).join(',');
    const thirtyMinAgo = new Date(Date.now() - 1800000).toISOString();
    const { data: recentSessions } = await supabaseAdmin
      .from('game_session_checkpoints')
      .select('session_token, score')
      .neq('session_token', submission.gameSessionToken)
      .gte('reported_at', thirtyMinAgo)
      .order('reported_at', { ascending: true });

    if (recentSessions && recentSessions.length > 0) {
      const sessionMap = new Map<string, number[]>();
      for (const row of recentSessions) {
        const arr = sessionMap.get(row.session_token) || [];
        arr.push(row.score);
        sessionMap.set(row.session_token, arr);
      }
      for (const [, scores] of sessionMap) {
        if (scores.join(',') === cpFingerprint) {
          return reject(supabaseAdmin, req, submission, 'DUPLICATE_PATTERN', 'Duplicate gameplay pattern detected', 403, cpDetail);
        }
      }
    }
  }

  // Entropy analysis (flags only)
  if (cps.length >= 5) {
    const positiveDeltas: number[] = [];
    for (let i = 1; i < cps.length; i++) {
      const d = cps[i].score - cps[i - 1].score;
      if (d > 0) positiveDeltas.push(d);
    }
    if (positiveDeltas.length >= 4) {
      const mean = positiveDeltas.reduce((a, b) => a + b, 0) / positiveDeltas.length;
      if (mean > 0) {
        const variance = positiveDeltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / positiveDeltas.length;
        const cv = Math.sqrt(variance) / mean;
        if (cv < 0.15) {
          addFlag(suspiciousFlags, { flag_type: 'uniform_score_deltas', severity: 'medium', reasoning: `Score delta CV=${cv.toFixed(3)} (< 0.15)` });
        }
      }
    }

    const ratios: number[] = [];
    for (let i = 1; i < cps.length; i++) {
      const sd = cps[i].score - cps[i - 1].score;
      const ad = (cps[i].asteroids_destroyed || 0) - (cps[i - 1].asteroids_destroyed || 0);
      if (ad > 0 && sd > 0) ratios.push(sd / ad);
    }
    if (ratios.length >= 4) {
      const rMean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      const rStd = Math.sqrt(ratios.reduce((sum, r) => sum + (r - rMean) ** 2, 0) / ratios.length);
      if (rStd < 5) {
        addFlag(suspiciousFlags, { flag_type: 'uniform_points_per_asteroid', severity: 'medium', reasoning: `pts/asteroid stdDev=${rStd.toFixed(2)} (< 5)` });
      }
    }
  }

  // Enriched metric consistency
  const lastCp = cps[cps.length - 1];
  const totalAsteroidsDestroyed = lastCp.asteroids_destroyed || 0;
  if (totalAsteroidsDestroyed > 0 && submission.score > 0) {
    const avgPointsPerAsteroid = submission.score / totalAsteroidsDestroyed;
    if (avgPointsPerAsteroid > 2000) {
      addFlag(suspiciousFlags, { flag_type: 'score_metric_mismatch', severity: 'medium', reasoning: `Score/asteroid ratio ${avgPointsPerAsteroid.toFixed(0)} exceeds 2000` });
    }
  }

  // Checkpoint clustering
  if (cps.length >= 2) {
    const firstCpTime = new Date(cps[0].reported_at).getTime();
    const lastCpTime = new Date(lastCp.reported_at).getTime();
    const cpSpanMs = lastCpTime - firstCpTime;
    const cpStartOffsetMs = firstCpTime - new Date(session.started_at).getTime();
    if (cpSpanMs < sessionAge * MAX_CHECKPOINT_SPAN_RATIO && cpStartOffsetMs < sessionAge * MAX_CHECKPOINT_START_RATIO) {
      addFlag(suspiciousFlags, { flag_type: 'checkpoint_clustering', severity: 'medium', reasoning: `All ${cps.length} checkpoints span only ${Math.round(cpSpanMs / 1000)}s at the start of a ${Math.round(sessionAge / 1000)}s session` });
    }
  }

  // Temporal anomaly
  const fiveMinutesAgo = new Date(Date.now() - 300000).toISOString();
  const { data: recentSame } = await supabaseAdmin
    .from('current_high_scores')
    .select('id')
    .eq('initials', submission.initials)
    .eq('score', submission.score)
    .gte('created_at', fiveMinutesAgo)
    .limit(1);
  if (recentSame && recentSame.length > 0) {
    addFlag(suspiciousFlags, { flag_type: 'temporal_cluster', severity: 'high', reasoning: `Identical score (${submission.score}) with initials ${submission.initials} within 5 minutes` });
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
    return reject(supabaseAdmin, req, submission, 'DUPLICATE_SCORE', 'Duplicate score detected', 409, cpDetail);
  }

  // --- Claim the session's single submission slot (atomic) ---
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('game_sessions')
    .update({ submission_count: 1 })
    .eq('id', session.id)
    .eq('submission_count', 0)
    .select('id');
  if (claimError) {
    console.error('Failed to claim session:', claimError);
    return errorResponse('Failed to save score', 500);
  }
  if (!claimed || claimed.length === 0) {
    return reject(supabaseAdmin, req, submission, 'MAX_SUBMISSIONS', 'Maximum submissions reached for this session', 403);
  }

  // --- Insert score + audit log ---
  const { data: scoreId, error: insertError } = await supabaseAdmin
    .rpc('insert_score_with_audit', {
      p_initials: submission.initials,
      p_score: submission.score,
      p_level: level,
      p_time_played_seconds: serverTimePlayedSeconds,
      p_source: source,
      p_session_token: submission.gameSessionToken,
    });

  if (insertError) {
    console.error('Database error:', insertError);
    await supabaseAdmin.from('game_sessions').update({ submission_count: 0 }).eq('id', session.id);
    return reject(supabaseAdmin, req, submission, 'INSERT_FAILED', 'Failed to save score', 500, cpDetail);
  }

  await supabaseAdmin
    .from('game_sessions')
    .update({ expired: true, last_submission_at: new Date().toISOString() })
    .eq('id', session.id);

  // --- Merge session flags and record ---
  const sessionFlags: Flag[] = Array.isArray(session.flags) ? session.flags : [];
  for (const f of sessionFlags) addFlag(suspiciousFlags, f);

  if (suspiciousFlags.length > 0 && scoreId) {
    for (const flag of suspiciousFlags) {
      const { error: flagError } = await supabaseAdmin
        .from('submission_flags')
        .insert({
          score_id: scoreId,
          flag_type: flag.flag_type,
          severity: flag.severity,
          reasoning: flag.reasoning,
        });
      if (flagError) {
        console.error('Failed to insert submission flag:', flagError);
      }
    }
  }

  return successResponse({ success: true, message: 'Score submitted successfully' });
}

// --- Admin handlers ---

async function handleAdminData(req: Request, supabaseAdmin: any) {
  const adminKey = req.headers.get('x-admin-key') || '';
  const expectedKey = Deno.env.get('ADMIN_SECRET_KEY') || '';
  if (!expectedKey || !timingSafeEqual(adminKey, expectedKey)) {
    return errorResponse('Unauthorized', 401);
  }

  const { data: scores, error: scoresError } = await supabaseAdmin
    .from('current_high_scores')
    .select('id, initials, score, level, time_played_seconds, source, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (scoresError) {
    return errorResponse('Failed to fetch scores', 500);
  }

  const { data: flagsData, error: flagsError } = await supabaseAdmin
    .from('submission_flags')
    .select('id, score_id, flag_type, severity, reasoning, admin_override, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  let flags = flagsData ?? [];
  if (flagsError) {
    console.error('admin-data: submission_flags query failed:', flagsError.message);
    flags = [];
  }

  const { data: auditData, error: auditError } = await supabaseAdmin
    .from('score_audit_log')
    .select('score_id, session_token, submission_method, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  let auditLogs = auditData ?? [];
  if (auditError) {
    console.error('admin-data: score_audit_log query failed:', auditError.message);
    auditLogs = [];
  }

  const { data: rejected, error: rejectedError } = await supabaseAdmin
    .from('rejected_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (rejectedError) {
    return errorResponse('Failed to fetch rejected submissions', 500);
  }

  return successResponse({ scores, flags, auditLogs, rejected });
}

async function handleAdminDelete(req: Request, supabaseAdmin: any) {
  const adminKey = req.headers.get('x-admin-key') || '';
  const expectedKey = Deno.env.get('ADMIN_SECRET_KEY') || '';
  if (!expectedKey || !timingSafeEqual(adminKey, expectedKey)) {
    return errorResponse('Unauthorized', 401);
  }

  const { scoreId } = await req.json();
  if (!scoreId) {
    return errorResponse('Missing scoreId', 400);
  }

  const { error } = await supabaseAdmin
    .from('current_high_scores')
    .delete()
    .eq('id', scoreId);

  if (error) {
    console.error('Admin delete error:', error);
    return errorResponse('Failed to delete score', 500);
  }

  return successResponse({ success: true, message: 'Score removed' });
}

async function handleAdminApprove(req: Request, supabaseAdmin: any) {
  const adminKey = req.headers.get('x-admin-key') || '';
  const expectedKey = Deno.env.get('ADMIN_SECRET_KEY') || '';
  if (!expectedKey || !timingSafeEqual(adminKey, expectedKey)) {
    return errorResponse('Unauthorized', 401);
  }

  const { rejectedId } = await req.json();
  if (!rejectedId) {
    return errorResponse('Missing rejectedId', 400);
  }

  const { data: row, error: rowError } = await supabaseAdmin
    .from('rejected_submissions')
    .select('*')
    .eq('id', rejectedId)
    .single();
  if (rowError || !row) {
    return errorResponse('Rejected submission not found', 404);
  }
  if (row.approved) {
    return errorResponse('Already approved', 409);
  }
  if (!row.initials || !Number.isInteger(row.score)) {
    return errorResponse('Rejected submission has no score to approve', 400);
  }

  const detail = (row.detail ?? {}) as Record<string, unknown>;
  const tps = Number(detail.serverTimePlayedSeconds);
  const { error: insertError } = await supabaseAdmin.rpc('insert_score_with_audit', {
    p_initials: row.initials,
    p_score: row.score,
    p_level: row.level ?? 1,
    p_time_played_seconds: Number.isFinite(tps) ? Math.floor(tps) : 0,
    p_source: 'admin_approved',
    p_session_token: row.session_token,
  });
  if (insertError) {
    console.error('Admin approve insert error:', insertError);
    return errorResponse('Failed to insert score', 500);
  }

  await supabaseAdmin.from('rejected_submissions').update({ approved: true }).eq('id', rejectedId);
  return successResponse({ success: true });
}

// --- Main handler ---
Deno.serve(async (req) => {
  const allowedOrigin = getAllowedOrigin(req);
  const dynamicCorsHeaders = {
    ...corsHeaders,
    'Access-Control-Allow-Origin': allowedOrigin ?? '',
  };

  const withCors = async (res: Response): Promise<Response> => {
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: { ...Object.fromEntries(res.headers.entries()), 'Access-Control-Allow-Origin': allowedOrigin ?? '' },
    });
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: dynamicCorsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const url = new URL(req.url);

    if (url.pathname.endsWith('/start-session') && req.method === 'POST') {
      return withCors(await handleStartSession(req, supabaseAdmin));
    }

    if (url.pathname.endsWith('/heartbeat') && req.method === 'POST') {
      return withCors(await handleHeartbeat(req, supabaseAdmin));
    }

    if (url.pathname.endsWith('/submit') && req.method === 'POST') {
      return withCors(await handleSubmit(req, supabaseAdmin));
    }

    if (url.pathname.endsWith('/admin-data') && req.method === 'GET') {
      return withCors(await handleAdminData(req, supabaseAdmin));
    }

    if (url.pathname.endsWith('/admin-delete') && req.method === 'POST') {
      return withCors(await handleAdminDelete(req, supabaseAdmin));
    }

    if (url.pathname.endsWith('/admin-approve') && req.method === 'POST') {
      return withCors(await handleAdminApprove(req, supabaseAdmin));
    }

    return withCors(errorResponse('Invalid endpoint', 404));
  } catch (error) {
    console.error('Error:', error);
    return withCors(errorResponse('Internal server error', 500));
  }
});
