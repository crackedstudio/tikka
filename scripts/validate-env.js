#!/usr/bin/env node

/**
 * Environment Validation Script
 * 
 * Run this script to validate your .env configuration before starting development.
 * Usage: node scripts/validate-env.js
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkEnvFile() {
    const envPath = join(rootDir, '.env');
    const envExamplePath = join(rootDir, '.env.example');

    log('\n🔍 Checking environment files...', 'cyan');

    if (!existsSync(envPath)) {
        log('❌ .env file not found!', 'red');
        log('   Run: cp .env.example .env', 'yellow');
        return false;
    }

    log('✅ .env file exists', 'green');

    if (!existsSync(envExamplePath)) {
        log('⚠️  .env.example file not found', 'yellow');
    }

    return true;
}

function parseEnvFile() {
    const envPath = join(rootDir, '.env');
    const content = readFileSync(envPath, 'utf-8');
    const env = {};

    content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key) {
                env[key.trim()] = valueParts.join('=').trim();
            }
        }
    });

    return env;
}

function validateStellarConfig(env) {
    log('\n🌟 Validating Stellar Configuration...', 'cyan');
    let valid = true;

    // Network
    const network = env.VITE_STELLAR_NETWORK;
    if (!network) {
        log('⚠️  VITE_STELLAR_NETWORK not set (defaulting to testnet)', 'yellow');
    } else if (network !== 'testnet' && network !== 'mainnet') {
        log(`❌ Invalid VITE_STELLAR_NETWORK: ${network}`, 'red');
        log('   Must be "testnet" or "mainnet"', 'yellow');
        valid = false;
    } else {
        log(`✅ Network: ${network}`, 'green');
    }

    // Horizon URL
    const horizonUrl = env.VITE_STELLAR_HORIZON_URL;
    if (!horizonUrl) {
        log('⚠️  VITE_STELLAR_HORIZON_URL not set', 'yellow');
    } else if (!horizonUrl.startsWith('https://')) {
        log('❌ VITE_STELLAR_HORIZON_URL must use HTTPS', 'red');
        valid = false;
    } else {
        log(`✅ Horizon URL: ${horizonUrl}`, 'green');
    }

    // Network Passphrase
    const passphrase = env.VITE_STELLAR_NETWORK_PASSPHRASE;
    if (!passphrase) {
        log('⚠️  VITE_STELLAR_NETWORK_PASSPHRASE not set', 'yellow');
    } else {
        log(`✅ Network Passphrase configured`, 'green');
    }

    return valid;
}

function validateSorobanConfig(env) {
    log('\n🔷 Validating Soroban Configuration...', 'cyan');
    let valid = true;

    // RPC URL
    const rpcUrl = env.VITE_SOROBAN_RPC_URL;
    if (!rpcUrl) {
        log('⚠️  VITE_SOROBAN_RPC_URL not set', 'yellow');
    } else if (!rpcUrl.startsWith('https://')) {
        log('❌ VITE_SOROBAN_RPC_URL must use HTTPS', 'red');
        valid = false;
    } else {
        log(`✅ Soroban RPC: ${rpcUrl}`, 'green');
    }

    // Contract Address
    const contractAddress = env.VITE_RAFFLE_CONTRACT_ADDRESS;
    if (!contractAddress) {
        log('⚠️  VITE_RAFFLE_CONTRACT_ADDRESS not set', 'yellow');
        log('   Contract interactions will not work until deployed', 'yellow');
    } else {
        log(`✅ Contract Address: ${contractAddress.substring(0, 10)}...`, 'green');
    }

    return valid;
}

function validateSupabaseConfig(env) {
    log('\n💾 Validating Supabase Configuration...', 'cyan');
    let valid = true;

    // URL
    const url = env.VITE_SUPABASE_URL;
    if (!url) {
        log('❌ VITE_SUPABASE_URL not set', 'red');
        valid = false;
    } else if (url === 'your_supabase_url' || url.includes('your-project')) {
        log('❌ VITE_SUPABASE_URL is still placeholder value', 'red');
        log('   Get your URL from Supabase dashboard', 'yellow');
        valid = false;
    } else if (!url.startsWith('https://')) {
        log('❌ VITE_SUPABASE_URL must use HTTPS', 'red');
        valid = false;
    } else if (!url.includes('.supabase.co')) {
        log('⚠️  VITE_SUPABASE_URL format looks unusual', 'yellow');
        log(`   Expected format: https://xxxxx.supabase.co`, 'yellow');
    } else {
        log(`✅ Supabase URL: ${url}`, 'green');
    }

    // Anon Key
    const anonKey = env.VITE_SUPABASE_ANON_KEY;
    if (!anonKey) {
        log('❌ VITE_SUPABASE_ANON_KEY not set', 'red');
        valid = false;
    } else if (anonKey === 'your_supabase_anon_key' || anonKey === 'your-anon-key') {
        log('❌ VITE_SUPABASE_ANON_KEY is still placeholder value', 'red');
        log('   Get your key from Supabase dashboard', 'yellow');
        valid = false;
    } else if (!anonKey.startsWith('eyJ')) {
        log('⚠️  VITE_SUPABASE_ANON_KEY format looks unusual', 'yellow');
        log('   Expected to start with "eyJ"', 'yellow');
    } else {
        log(`✅ Supabase Anon Key: ${anonKey.substring(0, 20)}...`, 'green');
    }

    // Table
    const table = env.VITE_SUPABASE_TABLE;
    if (!table) {
        log('⚠️  VITE_SUPABASE_TABLE not set (defaulting to raffle_metadata)', 'yellow');
    } else {
        log(`✅ Table: ${table}`, 'green');
    }

    return valid;
}

function validateDevelopmentConfig(env) {
    log('\n🛠️  Development Configuration...', 'cyan');

    const useDemoData = env.VITE_USE_DEMO_DATA;
    const debugMode = env.VITE_DEBUG_MODE;

    if (useDemoData === 'true') {
        log('ℹ️  Demo mode enabled (VITE_USE_DEMO_DATA=true)', 'blue');
        log('   App will use mock data instead of blockchain', 'blue');
    }

    if (debugMode === 'true') {
        log('ℹ️  Debug mode enabled (VITE_DEBUG_MODE=true)', 'blue');
    }

    return true;
}

function printSummary(results) {
    log('\n' + '='.repeat(50), 'cyan');
    log('📋 Validation Summary', 'cyan');
    log('='.repeat(50), 'cyan');

    const allValid = results.every(r => r);

    if (allValid) {
        log('\n✅ All configurations are valid!', 'green');
        log('   You can start the development server with: npm run dev', 'green');
    } else {
        log('\n❌ Some configurations need attention', 'red');
        log('   Please fix the errors above before starting development', 'yellow');
        log('\n📖 For help, see:', 'cyan');
        log('   - DEVELOPMENT.md for setup instructions', 'cyan');
        log('   - docs/ENVIRONMENT_SETUP.md for detailed guide', 'cyan');
    }

    log('');
    return allValid;
}

// Main execution
function main() {
    log('╔════════════════════════════════════════════════╗', 'cyan');
    log('║     Tikka Environment Validation Script       ║', 'cyan');
    log('╚════════════════════════════════════════════════╝', 'cyan');

    if (!checkEnvFile()) {
        process.exit(1);
    }

    const env = parseEnvFile();
    
    const results = [
        validateStellarConfig(env),
        validateSorobanConfig(env),
        validateSupabaseConfig(env),
        validateDevelopmentConfig(env),
    ];

    const allValid = printSummary(results);
    process.exit(allValid ? 0 : 1);
}

main();
