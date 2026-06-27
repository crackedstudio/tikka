import { createSecurityOptions } from './bootstrap';

describe('createSecurityOptions', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.VITE_FRONTEND_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.STELLAR_HORIZON_URL;
  });

  it('uses production defaults from env values', () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_FRONTEND_URL = 'https://app.tikka.io';
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.STELLAR_HORIZON_URL = 'https://horizon.stellar.org';

    const options = createSecurityOptions();

    expect(options.isProduction).toBe(true);
    expect(options.frontendUrl).toBe('https://app.tikka.io');
    expect(options.supabaseUrl).toBe('https://project.supabase.co');
    expect(options.stellarHorizonUrl).toBe('https://horizon.stellar.org');
  });

  it('supports explicit overrides for testability', () => {
    const options = createSecurityOptions({
      isProduction: false,
      frontendUrl: 'http://localhost:5173',
      supabaseUrl: 'https://my.supabase.local',
      stellarHorizonUrl: 'https://horizon-testnet.stellar.org',
    });

    expect(options).toEqual({
      isProduction: false,
      frontendUrl: 'http://localhost:5173',
      supabaseUrl: 'https://my.supabase.local',
      stellarHorizonUrl: 'https://horizon-testnet.stellar.org',
    });
  });

  it('keeps development mode when NODE_ENV is not production', () => {
    process.env.NODE_ENV = 'development';

    const options = createSecurityOptions();

    expect(options.isProduction).toBe(false);
  });
});
