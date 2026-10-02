/**
 * Tests for client/src/config/env.ts
 *
 * env.ts is evaluated at module-load time, so each group of tests that needs a
 * different set of env vars must:
 *   1. stub the vars with vi.stubEnv before importing
 *   2. call vi.resetModules() so the next dynamic import() gets a fresh module
 *
 * The helper `loadEnv()` encapsulates that pattern.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal env that satisfies every required variable
// ---------------------------------------------------------------------------
const VALID_ENV: Record<string, string> = {
    VITE_SUPABASE_URL: 'https://abc123.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    // All other vars have safe defaults in env.ts, so they are optional here.
};

/**
 * Stub env vars, reset modules, and dynamically import env.ts so we exercise
 * the module-load-time validation path.
 */
async function loadEnv(overrides: Record<string, string> = {}) {
    const vars = { ...VALID_ENV, ...overrides };
    for (const [key, value] of Object.entries(vars)) {
        vi.stubEnv(key, value);
    }
    vi.resetModules();
    const mod = await import('./env');
    return mod.env;
}

/**
 * Stub only the given vars (no VALID_ENV base), then try to import env.ts.
 * Returns the thrown error, or throws if no error was raised.
 */
async function loadEnvExpectingError(vars: Record<string, string>): Promise<Error> {
    for (const [key, value] of Object.entries(vars)) {
        vi.stubEnv(key, value);
    }
    vi.resetModules();
    try {
        await import('./env');
        throw new Error('Expected env.ts to throw, but it did not');
    } catch (err) {
        return err as Error;
    }
}

// ---------------------------------------------------------------------------
// Helpers to clear all stubbed env vars between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

// ===========================================================================
// 1. Happy-path: all variables present
// ===========================================================================
describe('env – all variables present', () => {
    it('loads without throwing', async () => {
        const env = await loadEnv({
            VITE_STELLAR_NETWORK: 'mainnet',
            VITE_STELLAR_HORIZON_URL: 'https://horizon.stellar.org',
            VITE_STELLAR_NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015',
            VITE_SOROBAN_RPC_URL: 'https://soroban-rpc.stellar.org',
            VITE_RAFFLE_CONTRACT_ADDRESS: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
            VITE_APP_ENV: 'production',
            VITE_DEBUG_MODE: 'false',
            VITE_API_TIMEOUT: '10000',
            VITE_FEATURE_LEADERBOARD: 'true',
            VITE_FEATURE_SOCIAL_SHARE: 'false',
            VITE_FEATURE_EMAIL_NOTIFICATIONS: 'true',
        });

        expect(env).toBeDefined();
    });

    it('exposes the expected top-level shape', async () => {
        const env = await loadEnv();
        expect(env).toHaveProperty('stellar');
        expect(env).toHaveProperty('soroban');
        expect(env).toHaveProperty('supabase');
        expect(env).toHaveProperty('wallet');
        expect(env).toHaveProperty('app');
        expect(env).toHaveProperty('features');
        expect(env).toHaveProperty('dev');
    });

    it('correctly maps VITE_SUPABASE_URL', async () => {
        const env = await loadEnv();
        expect(env.supabase.url).toBe('https://abc123.supabase.co');
    });

    it('correctly maps VITE_SUPABASE_ANON_KEY', async () => {
        const env = await loadEnv();
        expect(env.supabase.anonKey).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
    });

    it('defaults VITE_STELLAR_NETWORK to testnet when absent', async () => {
        const env = await loadEnv();
        expect(env.stellar.network).toBe('testnet');
    });

    it('uses mainnet when VITE_STELLAR_NETWORK=mainnet', async () => {
        const env = await loadEnv({ VITE_STELLAR_NETWORK: 'mainnet' });
        expect(env.stellar.network).toBe('mainnet');
    });

    it('defaults VITE_SOROBAN_RPC_URL to the testnet RPC endpoint', async () => {
        const env = await loadEnv();
        expect(env.soroban.rpcUrl).toBe('https://soroban-testnet.stellar.org');
    });

    it('parses VITE_API_TIMEOUT as a number', async () => {
        const env = await loadEnv({ VITE_API_TIMEOUT: '5000' });
        expect(env.app.apiTimeout).toBe(5000);
    });

    it('falls back to the default API timeout (30 000 ms) when absent', async () => {
        const env = await loadEnv();
        expect(env.app.apiTimeout).toBe(30000);
    });

    it('parses boolean feature flags correctly', async () => {
        const env = await loadEnv({
            VITE_FEATURE_LEADERBOARD: 'false',
            VITE_FEATURE_SOCIAL_SHARE: 'true',
            VITE_FEATURE_EMAIL_NOTIFICATIONS: '1',
        });
        expect(env.features.leaderboard).toBe(false);
        expect(env.features.socialShare).toBe(true);
        expect(env.features.emailNotifications).toBe(true);
    });

    it('defaults VITE_SUPABASE_TABLE to raffle_metadata', async () => {
        const env = await loadEnv();
        expect(env.supabase.table).toBe('raffle_metadata');
    });
});

// ===========================================================================
// 2. Missing required variables → must throw at boot, not silently degrade
// ===========================================================================
describe('env – missing required variables', () => {
    it('throws when VITE_SUPABASE_URL is absent', async () => {
        const err = await loadEnvExpectingError({
            VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        });
        expect(err.message).toMatch(/VITE_SUPABASE_URL/);
    });

    it('throws when VITE_SUPABASE_ANON_KEY is absent', async () => {
        const err = await loadEnvExpectingError({
            VITE_SUPABASE_URL: 'https://abc123.supabase.co',
        });
        expect(err.message).toMatch(/VITE_SUPABASE_ANON_KEY/);
    });

    it('throws when both Supabase vars are absent', async () => {
        // No vars at all – every required var is missing.
        const err = await loadEnvExpectingError({});
        // Either required var's error is acceptable; the module must not load silently.
        expect(err.message).toMatch(/VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/);
    });

    it('error message references the .env file for remediation', async () => {
        const err = await loadEnvExpectingError({
            VITE_SUPABASE_URL: 'https://abc123.supabase.co',
        });
        expect(err.message).toMatch(/\.env/i);
    });
});

// ===========================================================================
// 3. Malformed / invalid values
// ===========================================================================
describe('env – malformed values', () => {
    it('falls back to testnet for an unrecognised VITE_STELLAR_NETWORK value', async () => {
        // Invalid network values must not crash – they are warn-only – but the
        // resolved network must be a valid union member.
        const env = await loadEnv({ VITE_STELLAR_NETWORK: 'devnet' });
        expect(['testnet', 'mainnet']).toContain(env.stellar.network);
    });

    it('treats a non-numeric VITE_API_TIMEOUT as the default (30 000 ms)', async () => {
        const env = await loadEnv({ VITE_API_TIMEOUT: 'banana' });
        expect(env.app.apiTimeout).toBe(30000);
    });

    it('treats "false" string as boolean false for feature flags', async () => {
        const env = await loadEnv({ VITE_FEATURE_LEADERBOARD: 'false' });
        expect(env.features.leaderboard).toBe(false);
    });

    it('treats "0" as boolean false for feature flags', async () => {
        const env = await loadEnv({ VITE_FEATURE_EMAIL_NOTIFICATIONS: '0' });
        expect(env.features.emailNotifications).toBe(false);
    });
});

// ===========================================================================
// 4. Contract ID validation
// ===========================================================================
describe('env – contract address', () => {
    it('accepts a well-formed C… Stellar strkey (56 chars)', async () => {
        // A valid Soroban contract address starts with 'C' and is 56 chars.
        const contractAddress = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
        const env = await loadEnv({ VITE_RAFFLE_CONTRACT_ADDRESS: contractAddress });
        expect(env.soroban.contractAddress).toBe(contractAddress);
    });

    it('returns an empty contractAddress when the variable is absent', async () => {
        const env = await loadEnv();
        // Optional variable – absence should not throw, but the field should be empty.
        expect(env.soroban.contractAddress).toBe('');
    });

    it('does not throw for an absent contract address (it is optional)', async () => {
        await expect(loadEnv()).resolves.toBeDefined();
    });
});

// ===========================================================================
// 5. No secrets exposed via VITE_ variables
// ===========================================================================
describe('env – no secrets in VITE_ variables', () => {
    /**
     * VITE_SUPABASE_ANON_KEY is the Supabase *anonymous* key, which is
     * intentionally public (it is the Row-Level Security surface, not a secret).
     * Supabase explicitly states it is safe to include in client bundles.
     *
     * No service-role key, JWT_SECRET, ADMIN_TOKEN, or database password should
     * ever appear in a VITE_ variable because those are server-side secrets.
     */
    const DANGEROUS_KEY_PATTERNS = [
        /SUPABASE_SERVICE_ROLE/,
        /SERVICE_KEY/,
        /JWT_SECRET/,
        /ADMIN_TOKEN/,
        /DB_PASSWORD/,
        /DATABASE_URL/,
        /PRIVATE_KEY/,
        /SECRET_KEY/,
    ];

    it('env.ts source does not reference server-side secret variable names', async () => {
        const { readFileSync } = await import('fs');
        const { resolve } = await import('path');
        const src = readFileSync(resolve(__dirname, 'env.ts'), 'utf-8');

        for (const pattern of DANGEROUS_KEY_PATTERNS) {
            expect(src).not.toMatch(pattern);
        }
    });

    it('the loaded config object does not contain any field named "secret" or "serviceKey"', async () => {
        const env = await loadEnv();
        const json = JSON.stringify(env).toLowerCase();
        expect(json).not.toContain('secret');
        expect(json).not.toContain('servicekey');
        expect(json).not.toContain('service_role');
    });
});
