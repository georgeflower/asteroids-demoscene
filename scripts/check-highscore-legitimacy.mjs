#!/usr/bin/env node

/**
 * Check Highscore Legitimacy (Node.js version)
 * 
 * This script checks whether a highscore was submitted through a legitimate
 * game session or was manually inserted into the database.
 * 
 * Usage:
 *   node scripts/check-highscore-legitimacy.mjs <score_id>
 * 
 * Example:
 *   node scripts/check-highscore-legitimacy.mjs 54936b71-eb3b-4295-bc4a-0b25a68d022d
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
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
          // Remove quotes if present
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
  // Load environment variables
  loadEnv();
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing Supabase environment variables');
    console.error('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set in .env file');
    process.exit(1);
  }
  
  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('🔍 Checking highscore legitimacy...\n');
  console.log(`Score ID: ${scoreId}\n`);
  
  // Query the highscore record
  const { data, error } = await supabase
    .from('current_high_scores')
    .select('id, initials, score, created_at, session_token, submission_method')
    .eq('id', scoreId)
    .single();
  
  if (error) {
    // Check if error is due to missing columns (migration not applied)
    if (error.message && (error.message.includes('session_token') || error.message.includes('submission_method'))) {
      console.error('❌ Error: Database migration not applied yet');
      console.error('');
      console.error('The tracking columns (session_token, submission_method) do not exist.');
      console.error('Please apply the migration first:');
      console.error('  supabase db push');
      console.error('');
      console.error('Or manually run the SQL from:');
      console.error('  /supabase/migrations/20260313125000_add_submission_tracking.sql');
      process.exit(1);
    }
    console.error('❌ Error querying database:', error.message);
    process.exit(1);
  }
  
  if (!data) {
    console.error('❌ No highscore found with that ID');
    process.exit(1);
  }
  
  const record = data;
  
  // Display record details
  console.log('📊 Highscore Details:');
  console.log('─'.repeat(50));
  console.log(`  ID:          ${record.id}`);
  console.log(`  Initials:    ${record.initials}`);
  console.log(`  Score:       ${record.score.toLocaleString()}`);
  console.log(`  Created:     ${new Date(record.created_at).toLocaleString()}`);
  console.log(`  Session Token: ${record.session_token || '(none)'}`);
  console.log(`  Method:      ${record.submission_method || '(none)'}`);
  console.log('─'.repeat(50));
  console.log();
  
  // Determine legitimacy
  console.log('🔎 Legitimacy Assessment:');
  console.log('─'.repeat(50));
  
  if (record.submission_method === 'edge_function' && record.session_token) {
    console.log('✅ LEGITIMATE SUBMISSION');
    console.log('   This score was submitted through the game\'s Edge Function');
    console.log('   with a valid session token from an active game session.');
    console.log();
    console.log('   The presence of a session token indicates:');
    console.log('   • The player started a game session');
    console.log('   • The score was validated against session rules');
    console.log('   • Rate limiting and duplicate checks were applied');
    console.log('   • The submission passed all security validations');
  } else if (record.submission_method === 'legacy') {
    console.log('⚠️  LEGACY SUBMISSION');
    console.log('   This score existed before the session token system was');
    console.log('   implemented. Cannot verify if it was from a real game session.');
    console.log();
    console.log('   This could be:');
    console.log('   • A legitimate score from before the security update');
    console.log('   • A manually inserted score from the early days');
  } else if (record.submission_method === 'manual') {
    console.log('🔴 MANUAL INSERTION');
    console.log('   This score was manually inserted into the database,');
    console.log('   NOT through the normal game submission process.');
    console.log();
    console.log('   This indicates:');
    console.log('   • Admin/service role was used to insert the score');
    console.log('   • No game session validation occurred');
    console.log('   • This was likely a test or manual override');
  } else {
    console.log('❓ UNKNOWN/UNVERIFIED');
    console.log('   This score does not have clear submission metadata.');
    console.log('   Missing session token and/or submission method.');
    console.log();
    console.log('   Possible reasons:');
    console.log('   • The score predates the tracking system');
    console.log('   • There was an error during submission');
    console.log('   • The score was inserted through an unknown method');
  }
  
  console.log('─'.repeat(50));
}

// Main execution
const scoreId = process.argv[2];

if (!scoreId) {
  console.error('Usage: node scripts/check-highscore-legitimacy.mjs <score_id>');
  console.error('Example: node scripts/check-highscore-legitimacy.mjs 54936b71-eb3b-4295-bc4a-0b25a68d022d');
  process.exit(1);
}

// Validate UUID format
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(scoreId)) {
  console.error('❌ Error: Invalid UUID format');
  process.exit(1);
}

await checkHighscoreLegitimacy(scoreId);
