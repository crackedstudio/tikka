import { validate } from './env.schema';

const validEnv: Record<string, string> = {
  PORT: '3001',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  INDEXER_URL: 'http://localhost:3002',
  INDEXER_TIMEOUT_MS: '5000',
  JWT_SECRET: 'a'.repeat(32),
  JWT_EXPIRES_IN: '7d',
  SIWS_DOMAIN: 'tikka.io',
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
      JWT_SECRET: 'b'.repeat(32),
      ADMIN_TOKEN: 'my-admin-token',
    };
    const result = validate(minimal);
    expect(result.PORT).toBe(3001);
    expect(result.INDEXER_URL).toBe('http://localhost:3002');
    expect(result.INDEXER_TIMEOUT_MS).toBe(5000);
    expect(result.JWT_EXPIRES_IN).toBe('7d');
    expect(result.SIWS_DOMAIN).toBe('tikka.io');
    expect(result.THROTTLE_DEFAULT_LIMIT).toBe(100);
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

  it('throws when JWT_SECRET is too short', () => {
    expect(() => validate({ ...validEnv, JWT_SECRET: 'short' })).toThrow(
      'Environment validation failed',
    );
  });

  it('coerces PORT from string to number', () => {
    const result = validate({ ...validEnv, PORT: '4000' });
    expect(result.PORT).toBe(4000);
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
});
