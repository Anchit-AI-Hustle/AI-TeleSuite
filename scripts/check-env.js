#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 * Runs before dev/build to ensure all required environment variables are set
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log(`${'='.repeat(60)}`, 'cyan');
  log(`  ${title}`, 'bold');
  log(`${'='.repeat(60)}`, 'cyan');
}

// Required environment variables for the application
const ENV_CONFIG = {
  required: [],
  optional: [
    {
      name: 'HUGGINGFACE_API_KEY',
      description: 'Hugging Face API key (optional, only needed if using hosted OSS models)',
      example: 'hf_...',
    },
    {
      name: 'GOOGLE_API_KEY',
      description: 'Google Gemini API key (optional for free version)',
      example: 'AIzaSy...',
    },
    {
      name: 'NEXT_PUBLIC_FIREBASE_API_KEY',
      description: 'Firebase API key for authentication',
      example: 'AIzaSy...',
    },
    {
      name: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
      description: 'Firebase auth domain',
      example: 'your-project.firebaseapp.com',
    },
    {
      name: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      description: 'Firebase project ID',
      example: 'your-project-id',
    },
    {
      name: 'BLOB_READ_WRITE_TOKEN',
      description: 'Vercel Blob storage token',
      example: 'vercel_blob_...',
    },
    {
      name: 'NODE_ENV',
      description: 'Node environment (development/production)',
      example: 'development',
    },
  ],
};

// Sign-in. Accounts live in Postgres and the session cookie is signed with a
// server secret; src/app/api/auth/route.ts answers 503 to every sign-up and
// sign-in when either is missing. Every page is behind sign-in, so a server
// without them is an app nobody can open - and nothing about the build shows
// it. Each entry lists the names the route accepts, first one preferred.
const SIGN_IN = [
  {
    names: ['DATABASE_URL', 'POSTGRES_URL'],
    description: 'Postgres connection string for accounts (Neon). The auth_users table is created on first use.',
    fix: 'Vercel: project > Storage > Create Database > Neon, connected to this project. It sets DATABASE_URL for you.',
  },
  {
    names: ['SESSION_SECRET', 'APP_PIN_HASH'],
    description: 'Secret the session cookie is signed with. Any long random string.',
    fix: 'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  },
];

// Load environment variables from .env files
function loadEnvFiles() {
  const envFiles = ['.env.local', '.env'];
  const envVars = {};

  for (const file of envFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key) {
            const value = valueParts.join('=').trim();
            // Remove quotes if present
            const cleanValue = value.replace(/^["']|["']$/g, '');
            if (!envVars[key]) {
              envVars[key] = cleanValue;
            }
          }
        }
      }
      log(`✓ Loaded ${file}`, 'green');
    } else {
      log(`⚠ ${file} not found`, 'yellow');
    }
  }

  return envVars;
}

// Check if a variable is set (either in process.env or loaded files)
function isVariableSet(name, loadedVars) {
  return !!(process.env[name] || loadedVars[name]);
}

// Get variable value (prefer process.env, fallback to loaded files)
function getVariableValue(name, loadedVars) {
  return process.env[name] || loadedVars[name] || '';
}

// Main validation function
function validateEnvironment() {
  logSection('Environment Variable Validation');

  const loadedVars = loadEnvFiles();
  console.log('');

  const issues = [];
  const warnings = [];

  // Check required variables
  logSection('Required Variables');
  for (const config of ENV_CONFIG.required) {
    const isSet = isVariableSet(config.name, loadedVars);
    const value = getVariableValue(config.name, loadedVars);

    if (!isSet || !value) {
      log(`✗ ${config.name}: MISSING`, 'red');
      log(`  Description: ${config.description}`, 'red');
      log(`  Example: ${config.example}`, 'yellow');
      issues.push({
        variable: config.name,
        issue: 'Missing required variable',
        suggestion: `Add ${config.name}=${config.example} to .env.local`,
      });
    } else {
      // Validate the value if validator exists
      if (config.validate) {
        const error = config.validate(value);
        if (error) {
          log(`⚠ ${config.name}: SET but ${error}`, 'yellow');
          log(`  Current: ${value.substring(0, 20)}...`, 'yellow');
          warnings.push({
            variable: config.name,
            issue: error,
            suggestion: 'Please verify your API key is correct',
          });
        } else {
          log(`✓ ${config.name}: OK`, 'green');
          log(`  Value: ${value.substring(0, 20)}...`, 'cyan');
        }
      } else {
        log(`✓ ${config.name}: SET`, 'green');
        log(`  Value: ${value.substring(0, 20)}...`, 'cyan');
      }
    }
  }

  // Check optional variables
  console.log('');
  logSection('Optional Variables');
  for (const config of ENV_CONFIG.optional) {
    const isSet = isVariableSet(config.name, loadedVars);
    const value = getVariableValue(config.name, loadedVars);

    if (!isSet || !value) {
      log(`○ ${config.name}: Not set`, 'yellow');
      log(`  Description: ${config.description}`, 'yellow');
    } else {
      log(`✓ ${config.name}: SET`, 'green');
      if (config.name.includes('KEY') || config.name.includes('TOKEN')) {
        log(`  Value: ${value.substring(0, 15)}...`, 'cyan');
      } else {
        log(`  Value: ${value}`, 'cyan');
      }
    }
  }

  // Sign-in. Reported by name only: these values are credentials, and a build
  // log is read by more people than the env var page is.
  console.log('');
  logSection('Sign-in');
  const isProductionDeploy = process.env.VERCEL_ENV === 'production';
  for (const config of SIGN_IN) {
    // The same rule the server applies (users.ts, session.ts): the first name
    // that is set at all wins, and only then is it trimmed. A whitespace-only
    // DATABASE_URL therefore hides a good POSTGRES_URL, here as it does there.
    const first = config.names.find((n) => getVariableValue(n, loadedVars));
    const found = first && getVariableValue(first, loadedVars).trim() ? first : null;
    if (found) {
      log(`✓ ${found}: SET`, 'green');
      continue;
    }
    const name = config.names[0];
    log(`${isProductionDeploy ? '✗' : '○'} ${name}: MISSING`, isProductionDeploy ? 'red' : 'yellow');
    log(`  Description: ${config.description}`, 'yellow');
    const entry = {
      variable: name,
      issue: 'Not set, so nobody can sign in or sign up: /api/auth answers 503 to every request.',
      suggestion: config.fix,
    };
    // Only a production deploy is refused. A failed build leaves the previous
    // deployment serving; a "successful" one replaces it with a locked door.
    // Local builds, previews and CI have no accounts to protect, so they warn.
    (isProductionDeploy ? issues : warnings).push(entry);
  }

  // Summary
  console.log('');
  logSection('Summary');

  if (issues.length === 0 && warnings.length === 0) {
    log('✓ All required environment variables are properly configured!', 'green');
    log('✓ Your application should work correctly.', 'green');
    return 0;
  }

  if (issues.length > 0) {
    console.log('');
    log('Critical Issues Found:', 'red');
    issues.forEach((issue, index) => {
      log(`\n${index + 1}. ${issue.variable}`, 'red');
      log(`   Problem: ${issue.issue}`, 'red');
      log(`   Fix: ${issue.suggestion}`, 'yellow');
    });

    console.log('');
    log('⚠ Application will NOT work correctly!', 'red');
    log('⚠ Please fix the issues above and try again.', 'red');
    console.log('');
    log('Quick fix:', 'yellow');
    log('  1. Create or edit .env.local file', 'yellow');
    log('  2. Add the missing variables', 'yellow');
    log('  3. Restart your dev server or rebuild', 'yellow');
    
    return 1;
  }

  if (warnings.length > 0) {
    console.log('');
    log('Warnings:', 'yellow');
    warnings.forEach((warning, index) => {
      log(`\n${index + 1}. ${warning.variable}`, 'yellow');
      log(`   Issue: ${warning.issue}`, 'yellow');
      log(`   Suggestion: ${warning.suggestion}`, 'yellow');
    });

    console.log('');
    log('⚠ Application may work, but please verify these warnings.', 'yellow');
  }

  return warnings.length > 0 ? 0 : 0; // Don't fail on warnings, only errors
}

// Run validation
const exitCode = validateEnvironment();
console.log('');
process.exit(exitCode);
