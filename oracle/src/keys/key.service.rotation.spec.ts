import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@stellar/stellar-sdk';
import { KeyService } from './key.service';
import { KeyProvider } from './key-provider.interface';
import { OracleLoggerService } from '../logger/oracle-logger';

function fakeProvider(
  publicKey: string,
): KeyProvider & { sign: jest.Mock; getPublicKey: jest.Mock } {
  return {
    getPublicKey: jest.fn(async () => publicKey),
    getPublicKeyBuffer: jest.fn(async () => Buffer.alloc(32)),
    sign: jest.fn(async () => Buffer.from(publicKey)),
    getProviderType: () => 'env',
    getProviderHealth: jest.fn(async () => ({
      status: 'healthy' as const,
      activeKeyId: publicKey,
      message: 'ok',
      checkedAt: '2026-01-01T00:00:00.000Z',
      providerType: 'env',
    })),
  };
}

describe('KeyService rotation', () => {
  const keypair = Keypair.random();
  let service: KeyService;
  let logs: string[];

  beforeEach(async () => {
    logs = [];
    const logger = {
      log: jest.fn((message: string) => logs.push(message)),
      warn: jest.fn(),
      error: jest.fn((message: string) => logs.push(message)),
      debug: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        KeyService,
        { provide: OracleLoggerService, useValue: logger },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) => {
              const values: Record<string, string> = {
                KEY_PROVIDER: 'env',
                ORACLE_PRIVATE_KEY: keypair.secret(),
              };
              return values[key] ?? defaultValue;
            },
          },
        },
      ],
    }).compile();
    service = module.get(KeyService);
    await service.onModuleInit();
  });

  it('swaps the active key and keeps the previous key during the grace period', async () => {
    const next = fakeProvider('GNEXT');
    await service.rotateKey(next);
    expect(service.getActiveSigningKey()).toBe(next);
    expect(service.getPreviousProvider()?.getProviderType()).toBe('env');
    expect(await service.getPreviousPublicKey()).toBe(keypair.publicKey());
    expect(logs.join('\n')).toContain('Key rotation completed');
    expect(logs.join('\n')).not.toContain(keypair.secret());
  });

  it('keeps the active key when the new provider fails', async () => {
    const secret = keypair.secret();
    const broken = fakeProvider('GNEXT');
    broken.getPublicKey.mockRejectedValue(new Error(secret));
    await expect(service.rotateKey(broken)).rejects.toThrow(
      'Key rotation failed: new provider did not return a valid public key',
    );
    expect(await service.getPublicKey()).toBe(keypair.publicKey());
    expect(service.getPreviousProvider()).toBeNull();
    expect(logs.join('\n')).not.toContain(secret);
  });

  it('drops the previous key when the 24 hour grace period elapses and resets it on the next rotation', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    const first = fakeProvider('GFIRST');
    const second = fakeProvider('GSECOND');
    await service.rotateKey(first);
    now.mockReturnValue(1_000 + KeyService.GRACE_PERIOD_MS - 1);
    expect(service.getPreviousProvider()).not.toBeNull();

    now.mockReturnValue(5_000);
    await service.rotateKey(second);
    expect(service.getPreviousProvider()).toBe(first);

    now.mockReturnValue(5_000 + KeyService.GRACE_PERIOD_MS);
    expect(service.getPreviousProvider()).toBeNull();
    now.mockRestore();
  });

  it('queues sign calls that arrive during rotation and signs with the new key', async () => {
    const current = fakeProvider('GCURRENT');
    await service.rotateKey(current);

    let release: (value: string) => void = () => undefined;
    const next = fakeProvider('GNEXT');
    next.getPublicKey.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const rotation = service.rotateKey(next);
    const signing = service.sign(Buffer.from('queued'));
    await Promise.resolve();
    expect(next.sign).not.toHaveBeenCalled();
    release('GNEXT');
    await rotation;
    await signing;
    expect(next.sign).toHaveBeenCalled();
    expect(current.sign).not.toHaveBeenCalled();
  });

  it('returns a stable signing reference captured before rotation', async () => {
    const next = fakeProvider('GNEXT');
    const captured = service.getActiveSigningKey();
    await service.rotateKey(next);
    expect(captured).not.toBe(next);
    expect(service.getActiveSigningKey()).toBe(next);
    const signature = await captured.sign(Buffer.from('in-flight'));
    expect(signature).toHaveLength(64);
  });
});
