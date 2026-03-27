import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-admin-key',
};

interface ScoreSubmission {
  initials: string;
  score: number;
  gameSessionToken: string;
  timestamp: number;
  level?: number;
  timePlayedSeconds?: number;
  source?: string;
  powNonce?: number;
  hmac?: string;
}

interface HeartbeatPayload {
  gameSessionToken: string;
  score: number;
  level: number;
  asteroidsDestroyed?: number;
  bulletsFired?: number;
  hmac?: string;
}

// --- Constants ---
const MAX_SUBMISSIONS_PER_SESSION = 1;
const SESSION_TIMEOUT_MS = 3600000; // 1 hour
const MIN_SUBMISSION_INTERVAL_MS = 5000;
const MAX_VALID_SCORE = 9999999;
const MAX_SCORE_PER_SECOND = 1000;
const MAX_SCORE_PER_LEVEL = 75000;
const MAX_LEVEL = 30;
const MIN_PLAY_TIME_SECONDS = 10;
const MIN_HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_SCORE_THRESHOLD = 50000;
const MAX_CHECKPOINT_GAP_SECONDS = 90;
const MAX_SCORE_JUMP_PER_SECOND = 1000;
const MAX_LEVEL_JUMP = 5;
const HIGH_SCORE_MIN_PLAY_SECONDS = 300;
const HIGH_SCORE_DURATION_THRESHOLD = 50000;
const MAX_CHECKPOINT_SPAN_RATIO = 0.15;
const MAX_CHECKPOINT_START_RATIO = 0.10;
const POW_DIFFICULTY = 18; // Number of leading zero bits required

// Scaled checkpoint requirements
const CHECKPOINT_REQUIREMENTS = [
  { minScore: 500000, minCheckpoints: 20 },
  { minScore: 200000, minCheckpoints: 10 },
  { minScore: 100000, minCheckpoints: 6 },
  { minScore: 50000, minCheckpoints: 3 },
];

function getMinCheckpoints(score: number): number {
  for (const req of CHECKPOINT_REQUIREMENTS) {
    if (score >= req.minScore) return req.minCheckpoints;
  }
  return 0;
}

const ALLOWED_ORIGINS = [
  'https://asteroids-demoscene.lovable.app',
  'https://id-preview--b6edd2f4-8993-4a05-a257-466f1a773f73.lovable.app',
  'https://b6edd2f4-8993-4a05-a257-466f1a773f73.lovableproject.com',
];

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

// --- Crypto helpers ---

async function verifyPoW(challenge: string, nonce: number, difficulty: number): Promise<boolean> {
  const data = new TextEncoder().encode(challenge + nonce.toString());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  // Check leading zero bits
  let zeroBits = 0;
  for (const byte of hashArray) {
    if (byte === 0) {
      zeroBits += 8;
    } else {
      // Count leading zeros in this byte
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

async function verifyHMAC(key: string, message: string, expectedHmac: string): Promise<boolean> {
  const computed = await computeHMAC(key, message);
  return computed === expectedHmac;
}

// --- Handlers ---

async function handleStartSession(req: Request, supabaseAdmin: any) {
  if (!validateOrigin(req)) {
    return errorResponse('Forbidden', 403);
  }

  const token = crypto.randomUUID();
  const challenge = crypto.randomUUID() + crypto.randomUUID(); // 64-char random challenge
  const sessionNonce = crypto.randomUUID(); // For HMAC signing
  const difficulty = POW_DIFFICULTY;

  try { await supabaseAdmin.rpc('cleanup_old_sessions'); } catch (_) { /* ignore */ }

  const { error } = await supabaseAdmin.from('game_sessions').insert({
    token,
    pow_challenge: challenge,
    pow_difficulty: difficulty,
    session_nonce: sessionNonce,
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

  // Verify HMAC signature
  if (session.session_nonce) {
    if (!payload.hmac) {
      return errorResponse('Missing signature', 400);
    }
    const message = `${payload.gameSessionToken}|${payload.score}|${payload.level}`;
    const valid = await verifyHMAC(session.session_nonce, message, payload.hmac);
    if (!valid) {
      console.log(`HMAC verification failed for heartbeat: token=${payload.gameSessionToken}`);
      return errorResponse('Invalid signature', 403);
    }
  }

  // Rate limit heartbeats
  const { data: lastCheckpoint } = await supabaseAdmin
    .from('game_session_checkpoints')
    .select('reported_at, score, asteroids_destroyed, bullets_fired')
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
    // Enriched metrics must be monotonically increasing
    if (payload.asteroidsDestroyed !== undefined && lastCheckpoint.asteroids_destroyed !== null) {
      if (payload.asteroidsDestroyed < lastCheckpoint.asteroids_destroyed) {
        return errorResponse('Invalid metric progression', 400);
      }
    }
    if (payload.bulletsFired !== undefined && lastCheckpoint.bullets_fired !== null) {
      if (payload.bulletsFired < lastCheckpoint.bullets_fired) {
        return errorResponse('Invalid metric progression', 400);
      }
    }
  }

  // Insert checkpoint with enriched data
  const { error: insertError } = await supabaseAdmin
    .from('game_session_checkpoints')
    .insert({
      session_token: payload.gameSessionToken,
      score: payload.score,
      level: payload.level,
      asteroids_destroyed: payload.asteroidsDestroyed ?? 0,
      bullets_fired: payload.bulletsFired ?? 0,
    });

  if (insertError) {
    console.error('Failed to insert checkpoint:', insertError);
    return errorResponse('Failed to save checkpoint', 500);
  }

  return successResponse({ ok: true });
}

async function handleSubmit(req: Request, supabaseAdmin: any) {
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

  // --- Proof-of-Work verification ---
  if (session.pow_challenge && session.pow_difficulty) {
    if (submission.powNonce === undefined || submission.powNonce === null) {
      return errorResponse('Missing proof-of-work solution', 403);
    }
    const powValid = await verifyPoW(session.pow_challenge, submission.powNonce, session.pow_difficulty);
    if (!powValid) {
      console.log(`PoW verification failed: token=${submission.gameSessionToken}, nonce=${submission.powNonce}`);
      return errorResponse('Invalid proof-of-work solution', 403);
    }
  }

  // --- HMAC verification ---
  if (session.session_nonce) {
    if (!submission.hmac) {
      return errorResponse('Missing signature', 400);
    }
    const message = `${submission.gameSessionToken}|${submission.score}|${submission.level ?? 1}`;
    const valid = await verifyHMAC(session.session_nonce, message, submission.hmac);
    if (!valid) {
      console.log(`HMAC verification failed for submit: token=${submission.gameSessionToken}`);
      return errorResponse('Invalid signature', 403);
    }
  }

  // --- Score plausibility ---
  const serverTimePlayedSeconds = Math.floor(sessionAge / 1000);

  if (serverTimePlayedSeconds < MIN_PLAY_TIME_SECONDS) {
    return errorResponse('Game duration too short', 403);
  }

  if (submission.score >= HIGH_SCORE_DURATION_THRESHOLD && serverTimePlayedSeconds < HIGH_SCORE_MIN_PLAY_SECONDS) {
    console.log(`High-score duration fail: score=${submission.score}, time=${serverTimePlayedSeconds}s, min=${HIGH_SCORE_MIN_PLAY_SECONDS}s`);
    return errorResponse('Insufficient play duration for this score', 403);
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
  const suspiciousFlags: Array<{ flag_type: string; severity: string; reasoning: string }> = [];
  const minCheckpoints = getMinCheckpoints(submission.score);

  if (minCheckpoints > 0) {
    const { data: checkpoints, error: cpError } = await supabaseAdmin
      .from('game_session_checkpoints')
      .select('*')
      .eq('session_token', submission.gameSessionToken)
      .order('reported_at', { ascending: true });

    if (cpError) {
      console.error('Failed to query checkpoints:', cpError);
      return errorResponse('Validation error', 500);
    }

    // Scaled checkpoint requirement
    if (!checkpoints || checkpoints.length < minCheckpoints) {
      console.log(`Checkpoint fail: score=${submission.score}, checkpoints=${checkpoints?.length ?? 0}, required=${minCheckpoints}`);
      return errorResponse('Insufficient gameplay data', 403);
    }

    // Validate checkpoint progression + detect stagnant/duplicate patterns
    let consecutiveDuplicateScores = 0;
    let consecutiveStagnantAsteroids = 0;
    let consecutiveStagnantBullets = 0;

    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1];
      const curr = checkpoints[i];
      const gapSeconds = (new Date(curr.reported_at).getTime() - new Date(prev.reported_at).getTime()) / 1000;

      if (gapSeconds > MAX_CHECKPOINT_GAP_SECONDS) {
        console.log(`Checkpoint gap too large: ${gapSeconds}s between checkpoints ${i-1} and ${i}`);
        return errorResponse('Gameplay data gap detected', 403);
      }

      const levelJump = curr.level - prev.level;
      if (levelJump > MAX_LEVEL_JUMP || levelJump < 0) {
        console.log(`Wave jump invalid: ${levelJump} levels between checkpoints ${i-1} and ${i}`);
        return errorResponse('Impossible wave progression detected', 403);
      }

      const scoreDelta = curr.score - prev.score;
      const maxJump = gapSeconds * MAX_SCORE_JUMP_PER_SECOND;
      if (scoreDelta > maxJump) {
        console.log(`Score jump too large: +${scoreDelta} in ${gapSeconds}s (max ${maxJump})`);
        return errorResponse('Score progression anomaly', 403);
      }

      // Validate enriched metrics monotonicity
      if (curr.asteroids_destroyed < prev.asteroids_destroyed) {
        return errorResponse('Invalid metric progression in checkpoints', 403);
      }
      if (curr.bullets_fired < prev.bullets_fired) {
        return errorResponse('Invalid metric progression in checkpoints', 403);
      }

      // Detect duplicate scores (exact same score in consecutive heartbeats)
      if (curr.score === prev.score && curr.score > 0) {
        consecutiveDuplicateScores++;
      } else {
        consecutiveDuplicateScores = 0;
      }

      // Detect stagnant asteroids_destroyed while score increases
      if (curr.asteroids_destroyed === prev.asteroids_destroyed && scoreDelta > 0) {
        consecutiveStagnantAsteroids++;
      } else {
        consecutiveStagnantAsteroids = 0;
      }

      // Detect stagnant bullets_fired while score increases
      if (curr.bullets_fired === prev.bullets_fired && scoreDelta > 0) {
        consecutiveStagnantBullets++;
      } else {
        consecutiveStagnantBullets = 0;
      }

      // Flag if 3+ consecutive stagnant checkpoints
      if (consecutiveDuplicateScores >= 3) {
        suspiciousFlags.push({
          flag_type: 'duplicate_score_sequence',
          severity: 'high',
          reasoning: `Score ${curr.score} unchanged for ${consecutiveDuplicateScores + 1} consecutive heartbeats`,
        });
      }
      if (consecutiveStagnantAsteroids >= 2) {
        suspiciousFlags.push({
          flag_type: 'stagnant_asteroids',
          severity: 'medium',
          reasoning: `asteroids_destroyed stuck at ${curr.asteroids_destroyed} for ${consecutiveStagnantAsteroids + 1} heartbeats while score increased`,
        });
      }
      if (consecutiveStagnantBullets >= 2) {
        suspiciousFlags.push({
          flag_type: 'stagnant_bullets',
          severity: 'medium',
          reasoning: `bullets_fired stuck at ${curr.bullets_fired} for ${consecutiveStagnantBullets + 1} heartbeats while score increased`,
        });
      }
    }

    // Cross-session fingerprint detection: check if another session submitted identical checkpoint score sequence
    const cpFingerprint = checkpoints.map((cp: any) => cp.score).join(',');
    if (checkpoints.length >= 3) {
      const thirtyMinAgo = new Date(Date.now() - 1800000).toISOString();
      const { data: recentSessions } = await supabaseAdmin
        .from('game_session_checkpoints')
        .select('session_token, score')
        .neq('session_token', submission.gameSessionToken)
        .gte('reported_at', thirtyMinAgo)
        .order('reported_at', { ascending: true });

      if (recentSessions && recentSessions.length > 0) {
        // Group by session_token
        const sessionMap = new Map<string, number[]>();
        for (const row of recentSessions) {
          const arr = sessionMap.get(row.session_token) || [];
          arr.push(row.score);
          sessionMap.set(row.session_token, arr);
        }
        for (const [otherToken, scores] of sessionMap) {
          const otherFingerprint = scores.join(',');
          if (otherFingerprint === cpFingerprint) {
            console.log(`Cross-session duplicate detected: ${submission.gameSessionToken} matches ${otherToken}`);
            return errorResponse('Duplicate gameplay pattern detected', 403);
          }
        }
      }
    }

    // --- Entropy-based validation ---
    if (checkpoints.length >= 5) {
      // 1. Score delta coefficient of variation (CV)
      const scoreDeltas: number[] = [];
      for (let i = 1; i < checkpoints.length; i++) {
        scoreDeltas.push(checkpoints[i].score - checkpoints[i - 1].score);
      }
      const positiveDeltas = scoreDeltas.filter(d => d > 0);
      if (positiveDeltas.length >= 4) {
        const mean = positiveDeltas.reduce((a, b) => a + b, 0) / positiveDeltas.length;
        if (mean > 0) {
          const variance = positiveDeltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / positiveDeltas.length;
          const stdDev = Math.sqrt(variance);
          const cv = stdDev / mean;
          if (cv < 0.15) {
            console.log(`Entropy fail: score delta CV=${cv.toFixed(4)} (min 0.15), deltas=[${positiveDeltas.join(',')}]`);
            return errorResponse('Score progression anomaly', 403);
          }
        }
      }

      // 2. Pts-per-asteroid ratio variance
      const ratios: number[] = [];
      for (let i = 1; i < checkpoints.length; i++) {
        const scoreDelta = checkpoints[i].score - checkpoints[i - 1].score;
        const asteroidDelta = (checkpoints[i].asteroids_destroyed || 0) - (checkpoints[i - 1].asteroids_destroyed || 0);
        if (asteroidDelta > 0 && scoreDelta > 0) {
          ratios.push(scoreDelta / asteroidDelta);
        }
      }
      if (ratios.length >= 4) {
        const ratioMean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        const ratioVariance = ratios.reduce((sum, r) => sum + (r - ratioMean) ** 2, 0) / ratios.length;
        const ratioStdDev = Math.sqrt(ratioVariance);
        if (ratioStdDev < 5) {
          console.log(`Entropy fail: pts/asteroid stdDev=${ratioStdDev.toFixed(2)} (min 5), ratios=[${ratios.map(r => r.toFixed(1)).join(',')}]`);
          return errorResponse('Score progression anomaly', 403);
        }
      }
    }

    // --- Level-1 score cap ---
    if (submission.level === 1 && submission.score > 15000) {
      console.log(`Level-1 cap fail: score=${submission.score} at level 1 (max 15000)`);
      return errorResponse('Score too high for reported level', 403);
    }

    // Check final score vs last checkpoint
    const lastCp = checkpoints[checkpoints.length - 1];
    const timeSinceLastCp = (Date.now() - new Date(lastCp.reported_at).getTime()) / 1000;
    const maxFinalJump = timeSinceLastCp * MAX_SCORE_JUMP_PER_SECOND;
    if (submission.score - lastCp.score > maxFinalJump) {
      console.log(`Final score jump too large: submitted=${submission.score}, lastCp=${lastCp.score}, gap=${timeSinceLastCp}s`);
      return errorResponse('Final score anomaly', 403);
    }

    // Enriched metric consistency: score should correlate with asteroids destroyed
    const totalAsteroidsDestroyed = lastCp.asteroids_destroyed || 0;
    if (totalAsteroidsDestroyed > 0 && submission.score > 0) {
      // Average points per asteroid should be within reasonable bounds (20-2000)
      const avgPointsPerAsteroid = submission.score / totalAsteroidsDestroyed;
      if (avgPointsPerAsteroid > 2000) {
        suspiciousFlags.push({
          flag_type: 'score_metric_mismatch',
          severity: 'medium',
          reasoning: `Score/asteroid ratio ${avgPointsPerAsteroid.toFixed(0)} exceeds reasonable max of 2000`,
        });
      }
    }

    // Checkpoint clustering check
    if (checkpoints.length >= 2) {
      const firstCpTime = new Date(checkpoints[0].reported_at).getTime();
      const lastCpTime = new Date(checkpoints[checkpoints.length - 1].reported_at).getTime();
      const cpSpanMs = lastCpTime - firstCpTime;
      const cpStartOffsetMs = firstCpTime - new Date(session.started_at).getTime();

      if (cpSpanMs < sessionAge * MAX_CHECKPOINT_SPAN_RATIO && cpStartOffsetMs < sessionAge * MAX_CHECKPOINT_START_RATIO) {
        suspiciousFlags.push({
          flag_type: 'checkpoint_clustering',
          severity: 'medium',
          reasoning: `All ${checkpoints.length} checkpoints span only ${Math.round(cpSpanMs / 1000)}s at the start of a ${Math.round(sessionAge / 1000)}s session`,
        });
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
      suspiciousFlags.push({
        flag_type: 'temporal_cluster',
        severity: 'high',
        reasoning: `Identical score (${submission.score}) with initials ${submission.initials} submitted within 5 minutes of an existing entry`,
      });
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

  // --- Expire session after single submission ---
  await supabaseAdmin
    .from('game_sessions')
    .update({
      submission_count: session.submission_count + 1,
      last_submission_at: new Date().toISOString(),
      expired: true,
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

  // --- Insert any suspicious flags ---
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
  if (!expectedKey || adminKey !== expectedKey) {
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

  const { data: flags, error: flagsError } = await supabaseAdmin
    .from('submission_flags')
    .select('id, score_id, flag_type, severity, reasoning, admin_override, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (flagsError) {
    return errorResponse('Failed to fetch flags', 500);
  }

  const { data: auditLogs, error: auditError } = await supabaseAdmin
    .from('score_audit_log')
    .select('score_id, session_token, submission_method, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (auditError) {
    return errorResponse('Failed to fetch audit logs', 500);
  }

  return successResponse({ scores, flags, auditLogs });
}

async function handleAdminDelete(req: Request, supabaseAdmin: any) {
  const adminKey = req.headers.get('x-admin-key') || '';
  const expectedKey = Deno.env.get('ADMIN_SECRET_KEY') || '';
  if (!expectedKey || adminKey !== expectedKey) {
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

    if (url.pathname.endsWith('/start-session') && req.method === 'POST') {
      return await handleStartSession(req, supabaseAdmin);
    }

    if (url.pathname.endsWith('/heartbeat') && req.method === 'POST') {
      return await handleHeartbeat(req, supabaseAdmin);
    }

    if (url.pathname.endsWith('/submit') && req.method === 'POST') {
      return await handleSubmit(req, supabaseAdmin);
    }

    if (url.pathname.endsWith('/admin-data') && req.method === 'GET') {
      return await handleAdminData(req, supabaseAdmin);
    }

    if (url.pathname.endsWith('/admin-delete') && req.method === 'POST') {
      return await handleAdminDelete(req, supabaseAdmin);
    }

    return errorResponse('Invalid endpoint', 404);
  } catch (error) {
    console.error('Error:', error);
    return errorResponse('Internal server error', 500);
  }
});
