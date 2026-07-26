/**
 * Tests for env.config.ts — the single typed config boundary.
 *
 * Each test group exercises one config module, verifying that:
 *  - Defaults are applied when env vars are absent.
 *  - Custom values are picked up when env vars are present.
 *  - Backward-compatible aliases delegate to the canonical getters.
 */

// Isolate env mutations per test
const saved: Record<string, string | undefined> = {};

function setEnv(pairs: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(pairs)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function restoreEnv(): void {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  Object.keys(saved).forEach((k) => delete saved[k]);
}

// Re-require after each env change so getters read fresh values
function getEnv() {
  // env.config.ts uses top-level getters that read process.env lazily,
  // so we can just re-import the same module — no cache busting needed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./env.config').env;
}

afterEach(() => {
  restoreEnv();
});

// -----------------------------------------------------------------------
// server
// -----------------------------------------------------------------------
describe('env.server', () => {
  it('uses default PORT 3001 when absent', () => {
    setEnv({ PORT: undefined });
    expect(getEnv().server.port).toBe(3001);
  });

  it('parses PORT from env', () => {
    setEnv({ PORT: '4000' });
    expect(getEnv().server.port).toBe(4000);
  });

  it('defaults nodeEnv to development', () => {
    setEnv({ NODE_ENV: undefined });
    expect(getEnv().server.nodeEnv).toBe('development');
  });

  it('reads NODE_ENV', () => {
    setEnv({ NODE_ENV: 'production' });
    expect(getEnv().server.nodeEnv).toBe('production');
  });

  it('defaults swaggerEnabled to false', () => {
    setEnv({ SWAGGER_ENABLED: undefined });
    expect(getEnv().server.swaggerEnabled).toBe(false);
  });

  it('defaults maintenanceMode to false', () => {
    setEnv({ MAINTENANCE_MODE: undefined });
    expect(getEnv().server.maintenanceMode).toBe(false);
  });
});

// -----------------------------------------------------------------------
// auth
// -----------------------------------------------------------------------
describe('env.auth', () => {
  it('returns defaults when env vars are absent', () => {
    setEnv({
      JWT_SECRET: undefined,
      JWT_EXPIRES_IN: undefined,
      SIWS_DOMAIN: undefined,
      SIWS_NONCE_TTL_SECONDS: undefined,
      ADMIN_TOKEN: undefined,
      ADMIN_IP_ALLOWLIST: undefined,
    });
    const auth = getEnv().auth;
    expect(auth.jwtSecret).toBe('dev-secret-change-in-production');
    expect(auth.jwtExpiresIn).toBe('7d');
    expect(auth.siwsDomain).toBe('tikka.io');
    expect(auth.siwsNonceTtlSeconds).toBe(300);
    expect(auth.adminToken).toBe('');
    expect(auth.adminIpAllowlist).toBe('');
  });

  it('picks up custom values', () => {
    setEnv({
      JWT_SECRET: 'a'.repeat(32),
      JWT_EXPIRES_IN: '1d',
      SIWS_DOMAIN: 'example.com',
      SIWS_NONCE_TTL_SECONDS: '600',
      ADMIN_TOKEN: 'admin-tok',
      ADMIN_IP_ALLOWLIST: '10.0.0.1',
    });
    const auth = getEnv().auth;
    expect(auth.jwtSecret).toBe('a'.repeat(32));
    expect(auth.jwtExpiresIn).toBe('1d');
    expect(auth.siwsDomain).toBe('example.com');
    expect(auth.siwsNonceTtlSeconds).toBe(600);
    expect(auth.adminToken).toBe('admin-tok');
    expect(auth.adminIpAllowlist).toBe('10.0.0.1');
  });
});

// -----------------------------------------------------------------------
// redis
// -----------------------------------------------------------------------
describe('env.redis', () => {
  it('defaults metadataCacheTtlSeconds to 3600', () => {
    setEnv({ METADATA_CACHE_TTL_SECONDS: undefined });
    expect(getEnv().redis.metadataCacheTtlSeconds).toBe(3600);
  });

  it('reads METADATA_CACHE_TTL_SECONDS', () => {
    setEnv({ METADATA_CACHE_TTL_SECONDS: '120' });
    expect(getEnv().redis.metadataCacheTtlSeconds).toBe(120);
  });
});

// -----------------------------------------------------------------------
// storage
// -----------------------------------------------------------------------
describe('env.storage', () => {
  it('defaults enableIpfsPinning to false', () => {
    setEnv({ ENABLE_IPFS_PINNING: undefined });
    expect(getEnv().storage.enableIpfsPinning).toBe(false);
  });

  it('defaults ipfsGatewayUrl', () => {
    setEnv({ IPFS_GATEWAY_URL: undefined });
    expect(getEnv().storage.ipfsGatewayUrl).toBe('https://ipfs.io/ipfs/');
  });
});

// -----------------------------------------------------------------------
// notifications
// -----------------------------------------------------------------------
describe('env.notifications', () => {
  it('defaults fcmEnabled to false', () => {
    setEnv({ FCM_ENABLED: undefined });
    expect(getEnv().notifications.fcmEnabled).toBe(false);
  });

  it('enables FCM when FCM_ENABLED=true', () => {
    setEnv({ FCM_ENABLED: 'true' });
    expect(getEnv().notifications.fcmEnabled).toBe(true);
  });
});

// -----------------------------------------------------------------------
// rateLimits
// -----------------------------------------------------------------------
describe('env.rateLimits', () => {
  it('returns sensible defaults', () => {
    setEnv({
      THROTTLE_DEFAULT_LIMIT: undefined,
      THROTTLE_DEFAULT_TTL: undefined,
      RAFFLE_CREATE_RATE_LIMIT: undefined,
      RAFFLE_CREATE_RATE_WINDOW_SECONDS: undefined,
    });
    const rl = getEnv().rateLimits;
    expect(rl.throttleDefaultLimit).toBe(100);
    expect(rl.throttleDefaultTtl).toBe(60);
    expect(rl.raffleCreateLimit).toBe(5);
    expect(rl.raffleCreateWindowSeconds).toBe(600);
  });
});

// -----------------------------------------------------------------------
// geo
// -----------------------------------------------------------------------
describe('env.geo', () => {
  it('defaults providerUrl and timeoutMs', () => {
    setEnv({ GEO_PROVIDER_URL: undefined, GEO_TIMEOUT_MS: undefined, BLOCKED_COUNTRIES: undefined });
    const geo = getEnv().geo;
    expect(geo.providerUrl).toBe('http://ip-api.com/json');
    expect(geo.timeoutMs).toBe(3000);
    expect(geo.blockedCountries).toBe('');
  });
});

// -----------------------------------------------------------------------
// sentry
// -----------------------------------------------------------------------
describe('env.sentry', () => {
  it('defaults tracesSampleRate to 0.1', () => {
    setEnv({ SENTRY_TRACES_SAMPLE_RATE: undefined, SENTRY_DSN: undefined });
    const s = getEnv().sentry;
    expect(s.tracesSampleRate).toBe(0.1);
    expect(s.dsn).toBeUndefined();
  });
});

// -----------------------------------------------------------------------
// backfill
// -----------------------------------------------------------------------
describe('env.backfill', () => {
  it('returns sensible defaults', () => {
    setEnv({
      BACKFILL_MAX_RANGE: undefined,
      BACKFILL_RETRY_COUNT: undefined,
      BACKFILL_RETRY_DELAY_MS: undefined,
      BACKFILL_HORIZON_TIMEOUT_MS: undefined,
    });
    const bf = getEnv().backfill;
    expect(bf.maxRange).toBe(10000);
    expect(bf.retryCount).toBe(3);
    expect(bf.retryDelayMs).toBe(1000);
    expect(bf.horizonTimeoutMs).toBe(10000);
  });
});

// -----------------------------------------------------------------------
// backward-compatible aliases
// -----------------------------------------------------------------------
describe('backward-compatible aliases', () => {
  it('env.jwt delegates to env.auth', () => {
    setEnv({
      JWT_SECRET: 'x'.repeat(32),
      JWT_EXPIRES_IN: '2d',
    });
    const e = getEnv();
    expect(e.jwt.secret).toBe(e.auth.jwtSecret);
    expect(e.jwt.expiresIn).toBe(e.auth.jwtExpiresIn);
  });

  it('env.siws delegates to env.auth', () => {
    setEnv({
      SIWS_DOMAIN: 'example.io',
      SIWS_NONCE_TTL_SECONDS: '999',
    });
    const e = getEnv();
    expect(e.siws.domain).toBe(e.auth.siwsDomain);
    expect(e.siws.nonceTtlSeconds).toBe(e.auth.siwsNonceTtlSeconds);
  });

  it('env.fcm delegates to env.notifications', () => {
    setEnv({ FCM_ENABLED: 'true' });
    const e = getEnv();
    expect(e.fcm.enabled).toBe(e.notifications.fcmEnabled);
  });

  it('env.blockedCountries delegates to env.geo', () => {
    setEnv({ BLOCKED_COUNTRIES: 'US,GB' });
    const e = getEnv();
    expect(e.blockedCountries).toBe(e.geo.blockedCountries);
    expect(e.blockedCountries).toBe('US,GB');
  });
});
