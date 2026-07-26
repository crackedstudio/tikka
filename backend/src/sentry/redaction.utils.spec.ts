import {
  redactSensitive,
  hashWallet,
  redactWalletAddresses,
  scrubPii,
  scrubSentryEvent,
  REDACTED_FIELDS,
} from './sentry';

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

describe('redactWalletAddresses', () => {
  it('replaces a Stellar public key (56 base32 chars) with its hash', () => {
    const key = 'GBRFDEK53ZB2TEJNDA223GK5C45XZS7K2V3N4M5P6Q7R8S9T0U1V2W3X4';
    const result = redactWalletAddresses(`user ${key} made a purchase`);
    expect(result).not.toContain(key);
    expect(result).toMatch(/^user [0-9a-f]{16} made a purchase$/);
  });

  it('replaces a Stellar secret seed (S…) with its hash', () => {
    const seed = 'SBRDEK53ZB2TEJNDA223GK5C45XZS7K2V3N4M5P6Q7R8S9T0U1V2W3X4';
    const result = redactWalletAddresses(`secret: ${seed}`);
    expect(result).not.toContain(seed);
    expect(result).toMatch(/^secret: [0-9a-f]{16}$/);
  });

  it('leaves non-matching strings unchanged', () => {
    const input = 'no wallet here, just text';
    expect(redactWalletAddresses(input)).toBe(input);
  });
});

describe('scrubPii', () => {
  it('redacts email fields', () => {
    const result = scrubPii({ email: 'alice@example.com', name: 'Alice' }) as Record<string, unknown>;
    expect(result.email).toBe('[REDACTED]');
    expect(result.name).toBe('Alice');
  });

  it('redacts emailAddress and user_email fields', () => {
    const result = scrubPii({
      emailAddress: 'bob@example.com',
      user_email: 'bob@example.com',
    }) as Record<string, unknown>;
    expect(result.emailAddress).toBe('[REDACTED]');
    expect(result.user_email).toBe('[REDACTED]');
  });

  it('redacts authorization and cookie headers', () => {
    const result = scrubPii({
      authorization: 'Bearer secret-token',
      cookie: 'session=abc123',
      'content-type': 'application/json',
    }) as Record<string, unknown>;
    expect(result.authorization).toBe('[REDACTED]');
    expect(result.cookie).toBe('[REDACTED]');
    expect(result['content-type']).toBe('application/json');
  });

  it('hashes Stellar wallet addresses in string values', () => {
    const wallet = 'GBRFDEK53ZB2TEJNDA223GK5C45XZS7K2V3N4M5P6Q7R8S9T0U1V2W3X4';
    const result = scrubPii({ address: wallet }) as Record<string, unknown>;
    expect(result.address).not.toBe(wallet);
    expect(result.address).toMatch(/^[0-9a-f]{16}$/);
  });

  it('recursively scrubs nested objects', () => {
    const wallet = 'GBRFDEK53ZB2TEJNDA223GK5C45XZS7K2V3N4M5P6Q7R8S9T0U1V2W3X4';
    const result = scrubPii({
      outer: { email: 'a@b.com', data: { wallet } },
    }) as any;
    expect(result.outer.email).toBe('[REDACTED]');
    expect(result.outer.data.wallet).toMatch(/^[0-9a-f]{16}$/);
  });

  it('scrubs arrays', () => {
    const result = scrubPii([{ email: 'a@b.com' }, { token: 'secret' }]) as any[];
    expect(result[0].email).toBe('[REDACTED]');
    expect(result[1].token).toBe('[REDACTED]');
  });

  it('does not mutate the original object', () => {
    const original = { email: 'a@b.com' };
    scrubPii(original);
    expect(original.email).toBe('a@b.com');
  });
});

describe('scrubSentryEvent', () => {
  const VALID_WALLET = 'GBRFDEK53ZB2TEJNDA223GK5C45XZS7K2V3N4M5P6Q7R8S9T0U1V2W3X4';

  it('redacts authorization header', () => {
    const event = {
      request: { headers: { authorization: 'Bearer secret' } },
    } as any;
    const result = scrubSentryEvent(event);
    expect(result.request!.headers!.authorization).toBe('[REDACTED]');
  });

  it('redacts cookie header', () => {
    const event = {
      request: { headers: { cookie: 'session=abc' } },
    } as any;
    const result = scrubSentryEvent(event);
    expect(result.request!.headers!.cookie).toBe('[REDACTED]');
  });

  it('redacts email fields in user context', () => {
    const event = {
      user: { email: 'alice@example.com', id: '123' },
    } as any;
    const result = scrubSentryEvent(event);
    expect(result.user!.email).toBe('[REDACTED]');
    expect(result.user!.id).toBe('123');
  });

  it('deletes request body', () => {
    const event = {
      request: { data: { password: 'secret', token: 'abc' }, method: 'POST' },
    } as any;
    const result = scrubSentryEvent(event);
    expect(result.request!.data).toBeUndefined();
    expect(result.request!.method).toBe('POST');
  });

  it('redacts query string params', () => {
    const event = {
      request: { query_string: { authorization: 'Bearer x', safe: 'ok' } },
    } as any;
    const result = scrubSentryEvent(event);
    expect(result.request!.query_string).toEqual({ authorization: '[REDACTED]', safe: 'ok' });
  });

  it('hashes wallet addresses in tags', () => {
    const event = {
      tags: { wallet: VALID_WALLET },
    } as any;
    const result = scrubSentryEvent(event);
    expect(result.tags!.wallet).not.toBe(VALID_WALLET);
    expect(result.tags!.wallet).toMatch(/^[0-9a-f]{16}$/);
  });

  it('redacts email fields in extra data', () => {
    const event = {
      extra: { email: 'leaked@example.com', debug: true },
    } as any;
    const result = scrubSentryEvent(event);
    expect(result.extra!.email).toBe('[REDACTED]');
    expect(result.extra!.debug).toBe(true);
  });

  it('redacts email fields in contexts', () => {
    const event = {
      contexts: { user: { email: 'bob@example.com' } },
    } as any;
    const result = scrubSentryEvent(event);
    expect(result.contexts!.user.email).toBe('[REDACTED]');
  });

  it('does not mutate the original event', () => {
    const event = {
      request: { headers: { authorization: 'Bearer x' } },
    } as any;
    scrubSentryEvent(event);
    expect(event.request.headers.authorization).toBe('Bearer x');
  });

  it('passes through an empty event unchanged', () => {
    const event = {} as any;
    const result = scrubSentryEvent(event);
    expect(result).toEqual({});
  });
});
