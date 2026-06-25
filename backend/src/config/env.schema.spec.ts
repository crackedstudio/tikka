import { validate } from './env.schema';

const validEnv: Record<string, string> = {
  PORT: '3001',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  STELLAR_NETWORK: 'testnet',
  INDEXER_URL: 'http://localhost:3002',
  INDEXER_TIMEOUT_MS: '5000',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(32),
  JWT_EXPIRES_IN: '7d',
  SIWS_DOMAIN: 'tikka.io',
  VITE_FRONTEND_URL: 'https://app.tikka.io',
  ADMIN_TOKEN: 'super-secret-admin-token',
};

describe('env.schema validate()', () => {
  it('accepts valid env', () => {
    const result = validate(validEnv);
    expect(result.PORT).toBe(3001);
    expect(result.SUPABASE_URL).toBe('https://test.supabase.co');
    expect(result.JWT_SECRET).toBe('a'.repeat(32));
  });

  it('applies defaults for optional vars', () => {
    const minimal: Record<string, string> = {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'key',
      STELLAR_NETWORK: 'testnet',
      INDEXER_URL: '',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'b'.repeat(32),
      VITE_FRONTEND_URL: 'https://app.tikka.io',
      ADMIN_TOKEN: 'my-admin-token',
    };
    const result = validate(minimal);
    expect(result.PORT).toBe(3001);
    expect(result.MAINTENANCE_MODE).toBe(false);
    expect(result.INDEXER_URL).toBe('http://localhost:3002');
    expect(result.INDEXER_TIMEOUT_MS).toBe(5000);
    expect(result.JWT_EXPIRES_IN).toBe('7d');
    expect(result.SIWS_DOMAIN).toBe('tikka.io');
    expect(result.THROTTLE_DEFAULT_LIMIT).toBe(100);
    expect(result.REDIS_URL).toBe('redis://localhost:6379');
    expect(result.METADATA_CACHE_TTL_SECONDS).toBe(3600);
    expect(result.RAFFLE_CREATE_RATE_LIMIT).toBe(5);
    expect(result.RAFFLE_CREATE_RATE_WINDOW_SECONDS).toBe(600);
    expect(result.FEATURE_RAFFLE_TICKET_PURCHASE).toBe(false);
    expect(result.ADMIN_IP_ALLOWLIST).toBe('');
  });

  it('throws when SUPABASE_URL is missing', () => {
    const { SUPABASE_URL: _, ...rest } = validEnv;
    expect(() => validate(rest)).toThrow('Environment validation failed');
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _, ...rest } = validEnv;
    expect(() => validate(rest)).toThrow('Environment validation failed');
  });

  it('throws when JWT_SECRET is missing', () => {
    const { JWT_SECRET: _, ...rest } = validEnv;
    expect(() => validate(rest)).toThrow('Environment validation failed');
  });

  it('throws when VITE_FRONTEND_URL is missing', () => {
    const { VITE_FRONTEND_URL: _, ...rest } = validEnv;
    expect(() => validate(rest)).toThrow('Environment validation failed');
  });

  it('throws when JWT_SECRET is too short', () => {
    expect(() => validate({ ...validEnv, JWT_SECRET: 'short' })).toThrow(
      'Environment validation failed',
    );
  });

  it('coerces PORT from string to number', () => {
    const result = validate({ ...validEnv, PORT: '4000' });
    expect(result.PORT).toBe(4000);
  });

  it('coerces MAINTENANCE_MODE from string to boolean', () => {
    const result = validate({ ...validEnv, MAINTENANCE_MODE: 'true' });
    expect(result.MAINTENANCE_MODE).toBe(true);
  });

  it('passes through unknown system env vars', () => {
    const result = validate({ ...validEnv, PATH: '/usr/bin', HOME: '/home/user' });
    expect(result.SUPABASE_URL).toBe('https://test.supabase.co');
    expect((result as Record<string, unknown>).PATH).toBe('/usr/bin');
  });

  it('throws when ADMIN_TOKEN is missing', () => {
    const { ADMIN_TOKEN: _, ...rest } = validEnv;
    expect(() => validate(rest)).toThrow('Environment validation failed');
  });

  it('throws when ADMIN_TOKEN is empty string', () => {
    expect(() => validate({ ...validEnv, ADMIN_TOKEN: '' })).toThrow(
      'Environment validation failed',
    );
  });

  it('defaults ADMIN_IP_ALLOWLIST to empty string when not set', () => {
    const result = validate(validEnv);
    expect(result.ADMIN_IP_ALLOWLIST).toBe('');
  });

  it('accepts a non-empty ADMIN_IP_ALLOWLIST', () => {
    const result = validate({ ...validEnv, ADMIN_IP_ALLOWLIST: '192.168.1.0/24,10.0.0.1' });
    expect(result.ADMIN_IP_ALLOWLIST).toBe('192.168.1.0/24,10.0.0.1');
  });

  it('defaults STELLAR_NETWORK to testnet when omitted', () => {
    const prev = process.env.STELLAR_NETWORK;
    delete process.env.STELLAR_NETWORK;
    try {
      const { STELLAR_NETWORK: _, ...withoutStellar } = validEnv;
      const result = validate(withoutStellar);
      expect(result.STELLAR_NETWORK).toBe('testnet');
    } finally {
      if (prev !== undefined) process.env.STELLAR_NETWORK = prev;
    }
  });

  it('fills INDEXER_URL from network defaults when INDEXER_URL is omitted', () => {
    const prevIndexer = process.env.INDEXER_URL;
    delete process.env.INDEXER_URL;
    try {
      const { INDEXER_URL: _, ...rest } = validEnv;
      const result = validate({ ...rest, STELLAR_NETWORK: 'mainnet' });
      expect(result.INDEXER_URL).toBe('http://localhost:3002');
      expect(result.STELLAR_NETWORK).toBe('mainnet');
    } finally {
      if (prevIndexer !== undefined) process.env.INDEXER_URL = prevIndexer;
    }
  });

  it('accepts STELLAR_CONTRACT_ID and STELLAR_HORIZON_URL overrides', () => {
    const result = validate({
      ...validEnv,
      STELLAR_CONTRACT_ID: 'CCONTRACTTEST1234567890123456789012',
      STELLAR_HORIZON_URL: 'https://horizon-custom.example.com',
    });
    expect(result.STELLAR_CONTRACT_ID).toBe('CCONTRACTTEST1234567890123456789012');
    expect(result.STELLAR_HORIZON_URL).toBe('https://horizon-custom.example.com');
  });

  // Sentry env var tests — Requirements 1.4, 1.5

  it('parses successfully when SENTRY_DSN is absent (Sentry disabled path)', () => {
    const { SENTRY_DSN: _, ...withoutDsn } = { ...validEnv, SENTRY_DSN: 'https://key@sentry.io/1' };
    // validEnv does not include SENTRY_DSN, so just validate without it
    const result = validate(validEnv);
    expect(result.SENTRY_DSN).toBeUndefined();
  });

  it('coerces SENTRY_TRACES_SAMPLE_RATE to a number and defaults to 0.1 when absent', () => {
    const result = validate(validEnv);
    expect(result.SENTRY_TRACES_SAMPLE_RATE).toBe(0.1);

    const resultWithRate = validate({ ...validEnv, SENTRY_TRACES_SAMPLE_RATE: '0.5' });
    expect(resultWithRate.SENTRY_TRACES_SAMPLE_RATE).toBe(0.5);
  });

  it('rejects SENTRY_TRACES_SAMPLE_RATE values outside [0, 1]', () => {
    expect(() => validate({ ...validEnv, SENTRY_TRACES_SAMPLE_RATE: '-0.1' })).toThrow(
      'Environment validation failed',
    );
    expect(() => validate({ ...validEnv, SENTRY_TRACES_SAMPLE_RATE: '1.1' })).toThrow(
      'Environment validation failed',
    );
  });

  // -------------------------------------------------------------------------
  // New fields added in #531
  // -------------------------------------------------------------------------

  it('defaults NODE_ENV to development', () => {
    const result = validate(validEnv);
    expect(result.NODE_ENV).toBe('development');
  });

  it('accepts custom NODE_ENV', () => {
    const result = validate({ ...validEnv, NODE_ENV: 'production' });
    expect(result.NODE_ENV).toBe('production');
  });

  it('throws when PORT is a non-numeric string', () => {
    expect(() => validate({ ...validEnv, PORT: 'abc' })).toThrow(
      'Environment validation failed',
    );
  });

  it('throws when PORT is negative', () => {
    expect(() => validate({ ...validEnv, PORT: '-1' })).toThrow(
      'Environment validation failed',
    );
  });

  it('defaults REDIS_URL to empty string when missing', () => {
    const { REDIS_URL: _, ...rest } = validEnv;
    const result = validate(rest);
    expect(result.REDIS_URL).toBe('');
  });

  it('throws when SUPABASE_URL is not a URL', () => {
    expect(() => validate({ ...validEnv, SUPABASE_URL: 'not-a-url' })).toThrow(
      'Environment validation failed',
    );
  });

  it('defaults FCM_ENABLED to false', () => {
    const result = validate(validEnv);
    expect(result.FCM_ENABLED).toBe(false);
  });

  it('coerces FCM_ENABLED from string', () => {
    const result = validate({ ...validEnv, FCM_ENABLED: 'true' });
    expect(result.FCM_ENABLED).toBe(true);
  });

  it('defaults backfill settings', () => {
    const result = validate(validEnv);
    expect(result.BACKFILL_MAX_RANGE).toBe(10000);
    expect(result.BACKFILL_RETRY_COUNT).toBe(3);
    expect(result.BACKFILL_RETRY_DELAY_MS).toBe(1000);
    expect(result.BACKFILL_HORIZON_TIMEOUT_MS).toBe(10000);
  });

  it('defaults throttle settings', () => {
    const result = validate(validEnv);
    expect(result.THROTTLE_DEFAULT_LIMIT).toBe(100);
    expect(result.THROTTLE_DEFAULT_TTL).toBe(60);
    expect(result.THROTTLE_AUTH_LIMIT).toBe(10);
    expect(result.THROTTLE_AUTH_TTL).toBe(60);
    expect(result.THROTTLE_NONCE_LIMIT).toBe(30);
    expect(result.THROTTLE_NONCE_TTL).toBe(60);
  });

  it('defaults geo settings', () => {
    const result = validate(validEnv);
    expect(result.GEO_PROVIDER_URL).toBe('http://ip-api.com/json');
    expect(result.GEO_TIMEOUT_MS).toBe(3000);
    expect(result.BLOCKED_COUNTRIES).toBe('');
  });

  it('includes descriptive error messages listing all invalid fields', () => {
    try {
      validate({});
      fail('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('Environment validation failed');
      expect(e.message).toContain('SUPABASE_URL');
      expect(e.message).toContain('.env.example');
    }
  });
});
