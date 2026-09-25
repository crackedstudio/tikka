import { EnvKeyProvider } from './env-key.provider';
import { OracleLoggerService } from '../../logger/oracle-logger';
import { Keypair } from '@stellar/stellar-sdk';
import { ed25519 } from '@noble/curves/ed25519';

describe('EnvKeyProvider', () => {
  let provider: EnvKeyProvider;
  let testKeypair: Keypair;
  let mockLogger: OracleLoggerService;

  beforeEach(() => {
    testKeypair = Keypair.random();
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as unknown as OracleLoggerService;
    provider = new EnvKeyProvider(mockLogger, testKeypair.secret());
  });

  it('should initialize successfully with a valid secret', () => {
    expect(provider).toBeDefined();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('EnvKeyProvider initialized for address'),
    );
  });

  it('should throw an error if no private key is provided', () => {
    expect(() => new EnvKeyProvider(mockLogger, '')).toThrow(
      'Private key is required for EnvKeyProvider',
    );
  });

  it('should throw an error for an invalid private key', () => {
    expect(() => new EnvKeyProvider(mockLogger, 'invalid-key')).toThrow(
      'Invalid private key format',
    );
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should return the correct public key string', async () => {
    const publicKey = await provider.getPublicKey();
    expect(publicKey).toBe(testKeypair.publicKey());
  });

  it('should return the correct public key buffer', async () => {
    const publicKeyBuffer = await provider.getPublicKeyBuffer();
    expect(Buffer.isBuffer(publicKeyBuffer)).toBe(true);
    expect(publicKeyBuffer.length).toBe(32);
    expect(publicKeyBuffer.equals(testKeypair.rawPublicKey())).toBe(true);
  });

  it('should generate a valid 64-byte signature', async () => {
    const message = Buffer.from('test message for signing');
    const signature = await provider.sign(message);
    
    expect(Buffer.isBuffer(signature)).toBe(true);
    expect(signature.length).toBe(64);
  });

  it('should generate deterministic signatures', async () => {
    const message = Buffer.from('test message for signing');
    const signature1 = await provider.sign(message);
    const signature2 = await provider.sign(message);
    
    expect(signature1.equals(signature2)).toBe(true);
  });

  it('should generate different signatures for different messages', async () => {
    const message1 = Buffer.from('test message 1');
    const message2 = Buffer.from('test message 2');
    
    const signature1 = await provider.sign(message1);
    const signature2 = await provider.sign(message2);
    
    expect(signature1.equals(signature2)).toBe(false);
  });

  it('should return the correct provider type', () => {
    expect(provider.getProviderType()).toBe('env');
  });

  it('should generate signatures verifiable by ed25519', async () => {
    const message = Buffer.from('test message for signing');
    const signature = await provider.sign(message);
    const publicKeyBuffer = await provider.getPublicKeyBuffer();
    
    const isValid = ed25519.verify(signature, message, publicKeyBuffer);
    expect(isValid).toBe(true);
  });

  it('should return the raw secret buffer', () => {
    const secretBuffer = provider.getSecretBuffer();
    expect(Buffer.isBuffer(secretBuffer)).toBe(true);
    expect(secretBuffer.length).toBe(32);
    expect(secretBuffer.equals(testKeypair.rawSecretKey())).toBe(true);
  });

  it('should return a healthy provider status', async () => {
    const health = await provider.getProviderHealth();
    expect(health.status).toBe('healthy');
    expect(health.activeKeyId).toBe(testKeypair.publicKey());
    expect(health.providerType).toBe('env');
  });
});
