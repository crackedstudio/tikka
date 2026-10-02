import type * as Sentry from '@sentry/react';
import { describe, expect, it } from 'vitest';
import {
  DEPTH_LIMIT_PLACEHOLDER,
  MAX_STRING_LENGTH,
  REDACTED_FIELDS,
  REDACTED_PLACEHOLDER,
  REDACTED_TRANSACTION_FIELDS,
  REDACTED_TRANSACTION_PLACEHOLDER,
  hashWallet,
  redactWalletAddresses,
  scrubPii,
  scrubSentryEvent,
} from './redaction';

const WALLET = 'GBRFDEK53ZB2TEJNDA223GK5C45XZS7K2V3N4M5P6Q7R7S7T7U7V7W7X';
const SEED = 'SBRFDEK53ZB2TEJNDA223GK5C45XZS7K2V3N4M5P6Q7R7S7T7U7V7W7X';

/** A base64 blob long enough to be treated as a transaction envelope. */
const XDR_BLOB = `AAAAAgAAAAB${'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2Yz3'.repeat(3)}`;

const asEvent = (value: Record<string, unknown>): Sentry.Event =>
  value as unknown as Sentry.Event;

describe('REDACTED_FIELDS', () => {
  it('contains the backend sensitive field names', () => {
    for (const field of ['authorization', 'token', 'signature', 'mnemonic', 'seed', 'password']) {
      expect(REDACTED_FIELDS).toContain(field);
    }
  });
});

describe('REDACTED_TRANSACTION_FIELDS', () => {
  it('covers the XDR fields the client pipeline produces', () => {
    for (const field of ['assembledxdr', 'signedxdr', 'xdr', 'envelope']) {
      expect(REDACTED_TRANSACTION_FIELDS).toContain(field);
    }
  });
});

describe('hashWallet', () => {
  it('returns null for undefined, null and blank input', () => {
    expect(hashWallet(undefined)).toBeNull();
    expect(hashWallet(null)).toBeNull();
    expect(hashWallet('')).toBeNull();
    expect(hashWallet('   ')).toBeNull();
  });

  it('returns a 16-char lowercase hex fingerprint', () => {
    expect(hashWallet(WALLET)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic and case-insensitive', () => {
    expect(hashWallet(WALLET)).toBe(hashWallet(WALLET));
    expect(hashWallet(WALLET)).toBe(hashWallet(WALLET.toLowerCase()));
  });

  it('trims whitespace before hashing', () => {
    expect(hashWallet(`  ${WALLET}  `)).toBe(hashWallet(WALLET));
  });

  it('produces different fingerprints for different wallets', () => {
    expect(hashWallet(WALLET)).not.toBe(hashWallet(SEED));
  });

  it('never returns the raw address', () => {
    expect(hashWallet(WALLET)).not.toBe(WALLET);
    expect(hashWallet(WALLET)?.includes(WALLET)).toBe(false);
  });
});

describe('redactWalletAddresses', () => {
  it('replaces a Stellar public key with its fingerprint', () => {
    const result = redactWalletAddresses(`user ${WALLET} bought a ticket`);
    expect(result).not.toContain(WALLET);
    expect(result).toBe(`user ${hashWallet(WALLET)} bought a ticket`);
  });

  it('replaces a Stellar secret seed with its fingerprint', () => {
    const result = redactWalletAddresses(`seed=${SEED}`);
    expect(result).not.toContain(SEED);
    expect(result).toBe(`seed=${hashWallet(SEED)}`);
  });

  it('leaves strings without a wallet address unchanged', () => {
    const input = 'nothing sensitive here';
    expect(redactWalletAddresses(input)).toBe(input);
  });
});

describe('scrubPii', () => {
  it('returns null and undefined unchanged', () => {
    expect(scrubPii(null)).toBeNull();
    expect(scrubPii(undefined)).toBeUndefined();
  });

  it('returns primitives unchanged', () => {
    expect(scrubPii(42)).toBe(42);
    expect(scrubPii(true)).toBe(true);
  });

  it('redacts sensitive fields case-insensitively', () => {
    const result = scrubPii({
      authorization: 'Bearer secret',
      TOKEN: 'abc',
      cookie: 'session=xyz',
      email: 'alice@example.com',
      'content-type': 'application/json',
    }) as Record<string, unknown>;

    expect(result.authorization).toBe(REDACTED_PLACEHOLDER);
    expect(result.TOKEN).toBe(REDACTED_PLACEHOLDER);
    expect(result.cookie).toBe(REDACTED_PLACEHOLDER);
    expect(result.email).toBe(REDACTED_PLACEHOLDER);
    expect(result['content-type']).toBe('application/json');
  });

  it('redacts XDR fields to a transaction placeholder', () => {
    const result = scrubPii({
      assembledXdr: XDR_BLOB,
      signed_xdr: XDR_BLOB,
      method: 'create_raffle',
    }) as Record<string, unknown>;

    expect(result.assembledXdr).toBe(REDACTED_TRANSACTION_PLACEHOLDER);
    expect(result.signed_xdr).toBe(REDACTED_TRANSACTION_PLACEHOLDER);
    expect(result.method).toBe('create_raffle');
  });

  it('redacts long base64 blobs found in free text', () => {
    const result = scrubPii(`submit failed for ${XDR_BLOB}`);
    expect(result).toBe(REDACTED_TRANSACTION_PLACEHOLDER);
  });

  it('hashes a bare wallet address string', () => {
    const result = scrubPii(WALLET) as string;
    expect(result).not.toBe(WALLET);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hashes wallet addresses inside longer strings', () => {
    const result = scrubPii({ address: `signed by ${WALLET}` }) as Record<string, unknown>;
    expect(result.address).toBe(`signed by ${hashWallet(WALLET)}`);
  });

  it('truncates very long non-payload strings', () => {
    const long = `${'sentence with punctuation. '.repeat(200)}`;
    expect(long.length).toBeGreaterThan(MAX_STRING_LENGTH);

    const result = scrubPii(long) as string;
    expect(result.length).toBeLessThan(long.length);
    expect(result.endsWith('…[truncated]')).toBe(true);
  });

  it('recurses into nested objects and arrays', () => {
    const result = scrubPii({
      outer: { email: 'a@b.com', data: { wallet: WALLET } },
      list: [{ token: 'abc' }, { safe: 'ok' }],
    }) as {
      outer: { email: string; data: { wallet: string } };
      list: Array<Record<string, unknown>>;
    };

    expect(result.outer.email).toBe(REDACTED_PLACEHOLDER);
    expect(result.outer.data.wallet).toMatch(/^[0-9a-f]{16}$/);
    expect(result.list[0].token).toBe(REDACTED_PLACEHOLDER);
    expect(result.list[1].safe).toBe('ok');
  });

  it('does not mutate the original object', () => {
    const original = { email: 'a@b.com', wallet: WALLET };
    scrubPii(original);
    expect(original.email).toBe('a@b.com');
    expect(original.wallet).toBe(WALLET);
  });

  it('returns the depth-limit placeholder at depth 10', () => {
    let nested: unknown = { leaf: 'value' };
    for (let index = 0; index < 10; index += 1) {
      nested = { a: nested };
    }

    let cursor: unknown = scrubPii(nested);
    for (let index = 0; index < 10; index += 1) {
      cursor = (cursor as Record<string, unknown>).a;
    }

    expect(cursor).toBe(DEPTH_LIMIT_PLACEHOLDER);
  });
});

describe('scrubSentryEvent', () => {
  it('redacts the authorization header', () => {
    const result = scrubSentryEvent(
      asEvent({ request: { headers: { authorization: 'Bearer secret' } } }),
    );
    expect(result.request?.headers?.authorization).toBe(REDACTED_PLACEHOLDER);
  });

  it('redacts the cookie header', () => {
    const result = scrubSentryEvent(
      asEvent({ request: { headers: { cookie: 'session=abc' } } }),
    );
    expect(result.request?.headers?.cookie).toBe(REDACTED_PLACEHOLDER);
  });

  it('drops the request body but keeps the method', () => {
    const result = scrubSentryEvent(
      asEvent({ request: { method: 'POST', data: { signedXdr: XDR_BLOB } } }),
    );
    expect(result.request?.data).toBeUndefined();
    expect(result.request?.method).toBe('POST');
  });

  it('redacts query-string params', () => {
    const result = scrubSentryEvent(
      asEvent({ request: { query_string: { authorization: 'Bearer x', safe: 'ok' } } }),
    );
    expect(result.request?.query_string).toEqual({
      authorization: REDACTED_PLACEHOLDER,
      safe: 'ok',
    });
  });

  it('hashes wallet addresses in tags', () => {
    const result = scrubSentryEvent(asEvent({ tags: { wallet: WALLET } }));
    expect(result.tags?.wallet).not.toBe(WALLET);
    expect(result.tags?.wallet).toMatch(/^[0-9a-f]{16}$/);
  });

  it('redacts emails in user, extra and contexts', () => {
    const result = scrubSentryEvent(
      asEvent({
        user: { email: 'alice@example.com', id: '42' },
        extra: { email: 'leaked@example.com', debug: true },
        contexts: { user: { email: 'bob@example.com' } },
      }),
    );

    expect(result.user?.email).toBe(REDACTED_PLACEHOLDER);
    expect(result.user?.id).toBe('42');
    expect(result.extra?.email).toBe(REDACTED_PLACEHOLDER);
    expect(result.extra?.debug).toBe(true);
    expect((result.contexts?.user as Record<string, unknown>).email).toBe(REDACTED_PLACEHOLDER);
  });

  it('redacts XDR payloads carried in extra', () => {
    const result = scrubSentryEvent(asEvent({ extra: { signedXdr: XDR_BLOB } }));
    expect(result.extra?.signedXdr).toBe(REDACTED_TRANSACTION_PLACEHOLDER);
  });

  it('redacts XDR payloads carried in breadcrumbs', () => {
    const result = scrubSentryEvent(
      asEvent({ breadcrumbs: [{ category: 'sdk', data: { signedXdr: XDR_BLOB } }] }),
    );
    const breadcrumb = result.breadcrumbs?.[0] as
      | { data?: Record<string, unknown> }
      | undefined;
    expect(breadcrumb?.data?.signedXdr).toBe(REDACTED_TRANSACTION_PLACEHOLDER);
  });

  it('does not mutate the original event', () => {
    const original = asEvent({ request: { headers: { authorization: 'Bearer x' } } });
    scrubSentryEvent(original);
    expect(original.request?.headers?.authorization).toBe('Bearer x');
  });

  it('passes an empty event through unchanged', () => {
    expect(scrubSentryEvent(asEvent({}))).toEqual({});
  });
});
