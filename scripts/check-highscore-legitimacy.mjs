#!/usr/bin/env node

/**
 * Check Highscore Legitimacy (Node.js version)
 * 
 * This script checks whether a highscore was submitted through a legitimate
 * game session or was manually inserted into the database.
 * 
 * Usage:
 *   node scripts/check-highscore-legitimacy.mjs <score_id>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const envContent = readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          let value = valueParts.join('=').trim();
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    console.error('Warning: Could not load .env file:', error.message);
  }
}

async function checkHighscoreLegitimacy(scoreId) {
  loadEnv();
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing environment variables');
    console.error('Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env file');
    console.error('Note: This script requires the service role key to access the audit log.');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('🔍 Checking highscore legitimacy...\n');
  console.log(`Score ID: ${scoreId}\n`);
  
  // Query the highscore record
  const { data: scoreData, error: scoreError } = await supabase
    .from('current_high_scores')
    .select('id, initials, score, created_at')
    .eq('id', scoreId)
    .single();
  
  if (scoreError) {
    console.error('❌ Error querying database:', scoreError.message);
    process.exit(1);
  }
  
  if (!scoreData) {
    console.error('❌ No highscore found with that ID');
    process.exit(1);
  }

  // Query audit log for session metadata
  const { data: auditData } = await supabase
    .from('score_audit_log')
    .select('session_token, submission_method')
    .eq('score_id', scoreId)
    .single();
  
  const sessionToken = auditData?.session_token || null;
  const submissionMethod = auditData?.submission_method || null;
  
  console.log('📊 Highscore Details:');
  console.log('─'.repeat(50));
  console.log(`  ID:          ${scoreData.id}`);
  console.log(`  Initials:    ${scoreData.initials}`);
  console.log(`  Score:       ${scoreData.score.toLocaleString()}`);
  console.log(`  Created:     ${new Date(scoreData.created_at).toLocaleString()}`);
  console.log(`  Session Token: ${sessionToken || '(none)'}`);
  console.log(`  Method:      ${submissionMethod || '(none)'}`);
  console.log('─'.repeat(50));
  console.log();
  
  console.log('🔎 Legitimacy Assessment:');
  console.log('─'.repeat(50));
  
  if (submissionMethod === 'edge_function' && sessionToken) {
    console.log('✅ LEGITIMATE SUBMISSION');
    console.log('   Submitted through the Edge Function with a valid session token.');
  } else if (submissionMethod === 'legacy') {
    console.log('⚠️  LEGACY SUBMISSION');
    console.log('   Predates the session token system. Cannot verify.');
  } else if (submissionMethod === 'manual') {
    console.log('🔴 MANUAL INSERTION');
    console.log('   Manually inserted, NOT through the game.');
  } else if (!auditData) {
    console.log('❓ NO AUDIT RECORD');
    console.log('   No audit log entry exists. Score predates tracking or was inserted directly.');
  } else {
    console.log('❓ UNKNOWN/UNVERIFIED');
    console.log('   Missing session token and/or submission method.');
  }
  
  console.log('─'.repeat(50));
}

const scoreId = process.argv[2];

if (!scoreId) {
  console.error('Usage: node scripts/check-highscore-legitimacy.mjs <score_id>');
  process.exit(1);
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(scoreId)) {
  console.error('❌ Error: Invalid UUID format');
  process.exit(1);
}

await checkHighscoreLegitimacy(scoreId);
