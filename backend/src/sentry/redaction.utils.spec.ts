import { redactSensitive, hashWallet, REDACTED_FIELDS } from './sentry';

describe('REDACTED_FIELDS', () => {
  it('contains expected sensitive field names', () => {
    expect(REDACTED_FIELDS).toContain('authorization');
    expect(REDACTED_FIELDS).toContain('token');
    expect(REDACTED_FIELDS).toContain('signature');
    expect(REDACTED_FIELDS).toContain('mnemonic');
    expect(REDACTED_FIELDS).toContain('seed');
    expect(REDACTED_FIELDS).toContain('password');
  });
});

describe('redactSensitive', () => {
  it('returns null/undefined unchanged', () => {
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
  });

  it('returns primitives unchanged', () => {
    expect(redactSensitive('hello')).toBe('hello');
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(true)).toBe(true);
  });

  it('redacts every field in REDACTED_FIELDS (exact case)', () => {
    for (const field of REDACTED_FIELDS) {
      const result = redactSensitive({ [field]: 'secret' }) as Record<string, unknown>;
      expect(result[field]).toBe('[REDACTED]');
    }
  });

  it('redacts fields case-insensitively', () => {
    const result = redactSensitive({ Authorization: 'Bearer x', TOKEN: 'abc' }) as Record<string, unknown>;
    expect(result['Authorization']).toBe('[REDACTED]');
    expect(result['TOKEN']).toBe('[REDACTED]');
  });

  it('preserves non-sensitive fields', () => {
    const result = redactSensitive({ 'content-type': 'application/json', 'x-request-id': 'req-1' }) as Record<string, unknown>;
    expect(result['content-type']).toBe('application/json');
    expect(result['x-request-id']).toBe('req-1');
  });

  it('recurses into nested objects', () => {
    const result = redactSensitive({ nested: { authorization: 'secret', safe: 'ok' } }) as any;
    expect(result.nested.authorization).toBe('[REDACTED]');
    expect(result.nested.safe).toBe('ok');
  });

  it('recurses into arrays', () => {
    const result = redactSensitive([{ token: 'abc' }, { safe: 'ok' }]) as any[];
    expect(result[0].token).toBe('[REDACTED]');
    expect(result[1].safe).toBe('ok');
  });

  it('does not mutate the original object', () => {
    const original = { authorization: 'secret' };
    redactSensitive(original);
    expect(original.authorization).toBe('secret');
  });

  it('returns [DEPTH_LIMIT] at depth 10', () => {
    // Build a 10-level deep object: { a: { a: { ... } } }
    let nested: Record<string, unknown> = { leaf: 'value' };
    for (let i = 0; i < 10; i++) nested = { a: nested };
    const result = redactSensitive(nested) as any;
    // At depth 10 the value should be replaced
    expect(result.a.a.a.a.a.a.a.a.a.a).toBe('[DEPTH_LIMIT]');
  });
});

describe('hashWallet', () => {
  it('returns null for undefined', () => expect(hashWallet(undefined)).toBeNull());
  it('returns null for null', () => expect(hashWallet(null)).toBeNull());
  it('returns null for blank string', () => expect(hashWallet('   ')).toBeNull());

  it('returns a 16-char lowercase hex string', () => {
    const result = hashWallet('GADDRESS123');
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic', () => {
    expect(hashWallet('GTEST')).toBe(hashWallet('GTEST'));
  });

  it('is case-insensitive (same hash for upper and lower)', () => {
    expect(hashWallet('GADDRESS')).toBe(hashWallet('gaddress'));
  });

  it('trims whitespace before hashing', () => {
    expect(hashWallet('  GADDRESS  ')).toBe(hashWallet('GADDRESS'));
  });

  it('produces different hashes for different addresses', () => {
    expect(hashWallet('GADDRESS1')).not.toBe(hashWallet('GADDRESS2'));
  });

  it('never returns the raw address', () => {
    const address = 'GRAWADDRESS123';
    const hash = hashWallet(address);
    expect(hash).not.toContain(address.toLowerCase());
  });
});
