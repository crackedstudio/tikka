import { redact } from './oracle-logger';

describe('redact()', () => {
  it('returns primitives unchanged (non-string)', () => {
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('redacts Stellar secret seeds in strings', () => {
    const seed = 'SCZANGBA5RLMQ4DQTNU37XHZIY5WHYD5X7YZOS7BNWZYCFNENFNUZ7Y';
    expect(redact(seed)).toBe('[REDACTED]');
    expect(redact(`key=${seed}`)).toBe('key=[REDACTED]');
  });

  it('leaves non-secret strings unchanged', () => {
    expect(redact('hello world')).toBe('hello world');
    expect(redact('GABCDE')).toBe('GABCDE'); // public key prefix G, not S
  });

  it('redacts known sensitive keys in objects', () => {
    const obj = {
      raffle_id: 1,
      request_id: 'req-abc',
      privateKey: 'super-secret',
      secret: 'my-secret',
      nonce: 'abc123',
      seed: 'deadbeef',
      proof: 'cafebabe',
      password: 'hunter2',
      token: 'jwt-token',
    };
    const result = redact(obj);
    expect(result.raffle_id).toBe(1);
    expect(result.request_id).toBe('req-abc');
    expect(result.privateKey).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.nonce).toBe('[REDACTED]');
    expect(result.seed).toBe('[REDACTED]');
    expect(result.proof).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
  });

  it('redacts nested sensitive keys', () => {
    const obj = { outer: { privateKey: 'secret', safe: 'value' } };
    const result = redact(obj);
    expect(result.outer.privateKey).toBe('[REDACTED]');
    expect(result.outer.safe).toBe('value');
  });

  it('redacts sensitive keys inside arrays', () => {
    const arr = [{ privateKey: 'secret', raffle_id: 1 }];
    const result = redact(arr);
    expect(result[0].privateKey).toBe('[REDACTED]');
    expect(result[0].raffle_id).toBe(1);
  });

  it('does not mutate the original object', () => {
    const obj = { privateKey: 'secret' };
    redact(obj);
    expect(obj.privateKey).toBe('secret');
  });

  it('redacts env-style keys', () => {
    const obj = {
      ORACLE_PRIVATE_KEY: 'raw-key',
      SUPABASE_SERVICE_ROLE_KEY: 'role-key',
      DATABASE_URL: 'postgres://user:pass@host/db',
    };
    const result = redact(obj);
    expect(result.ORACLE_PRIVATE_KEY).toBe('[REDACTED]');
    expect(result.SUPABASE_SERVICE_ROLE_KEY).toBe('[REDACTED]');
    expect(result.DATABASE_URL).toBe('[REDACTED]');
  });
});
