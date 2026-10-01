import { ConfigService } from '@nestjs/config';
import { Keypair } from '@stellar/stellar-sdk';
import { KeyProviderFactory } from './key-provider.factory';
import { EnvKeyProvider } from './providers/env-key.provider';
import { OracleLoggerService } from '../logger/oracle-logger';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string, defaultValue?: string) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue,
  } as unknown as ConfigService;
}

describe('KeyProviderFactory', () => {
  const messages: string[] = [];
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOverride = process.env.ALLOW_ENV_PROVIDER_IN_PRODUCTION;

  beforeEach(() => {
    messages.length = 0;
    jest.spyOn(OracleLoggerService.prototype, 'log').mockImplementation((message: unknown) => {
      messages.push(String(message));
    });
    jest.spyOn(OracleLoggerService.prototype, 'warn').mockImplementation((message: unknown) => {
      messages.push(String(message));
    });
    jest.spyOn(OracleLoggerService.prototype, 'error').mockImplementation((message: unknown) => {
      messages.push(String(message));
    });
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_ENV_PROVIDER_IN_PRODUCTION;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalOverride === undefined) delete process.env.ALLOW_ENV_PROVIDER_IN_PRODUCTION;
    else process.env.ALLOW_ENV_PROVIDER_IN_PRODUCTION = originalOverride;
    jest.restoreAllMocks();
  });

  it('throws for an unknown provider name instead of defaulting to env', () => {
    expect(() => KeyProviderFactory.create(config({ KEY_PROVIDER: 'vault' }))).toThrow(
      /Unknown KEY_PROVIDER type/,
    );
  });

  it('does not echo a secret stuffed into the provider name', () => {
    const secret = Keypair.random().secret();
    expect(() => KeyProviderFactory.create(config({ KEY_PROVIDER: secret }))).toThrow(
      /\[redacted\]/,
    );
    expect(messages.join('\n')).not.toContain(secret);
  });

  it('refuses a missing provider name in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => KeyProviderFactory.create(config({ NODE_ENV: 'production' }))).toThrow(
      /KEY_PROVIDER is required in production/,
    );
  });

  it('refuses the env provider in production without the loud override', () => {
    process.env.NODE_ENV = 'production';
    const secret = Keypair.random().secret();
    expect(() =>
      KeyProviderFactory.create(
        config({
          KEY_PROVIDER: 'env',
          NODE_ENV: 'production',
          ORACLE_PRIVATE_KEY: secret,
        }),
      ),
    ).toThrow(/ALLOW_ENV_PROVIDER_IN_PRODUCTION=true/);
    expect(messages.join('\n')).not.toContain(secret);
  });

  it('allows the env provider in production only with the override, and keeps the key out of logs and audit payloads', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_ENV_PROVIDER_IN_PRODUCTION = 'true';
    const keypair = Keypair.random();
    const secret = keypair.secret();
    const provider = KeyProviderFactory.create(
      config({
        KEY_PROVIDER: 'env',
        NODE_ENV: 'production',
        ALLOW_ENV_PROVIDER_IN_PRODUCTION: 'true',
        ORACLE_PRIVATE_KEY: secret,
      }),
    );

    const health = await provider.getProviderHealth();
    const auditRecord = JSON.stringify({ health, logs: messages });
    expect(provider.getProviderType()).toBe('env');
    expect(health.activeKeyId).toBe(keypair.publicKey());
    expect(auditRecord).not.toContain(secret);
  });

  it('refuses to construct EnvKeyProvider directly in production', () => {
    process.env.NODE_ENV = 'production';
    const logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as OracleLoggerService;
    expect(() => new EnvKeyProvider(logger, Keypair.random().secret())).toThrow(
      /ALLOW_ENV_PROVIDER_IN_PRODUCTION=true/,
    );
  });

  it('does not put an invalid key into the error or the log', () => {
    const secret = `not-a-key-${Keypair.random().secret()}`;
    const logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as OracleLoggerService;
    expect(() => new EnvKeyProvider(logger, secret)).toThrow('Invalid private key format');
    expect(String((logger.error as jest.Mock).mock.calls)).not.toContain(secret);
  });
});
