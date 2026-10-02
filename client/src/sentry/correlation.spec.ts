import { afterEach, describe, expect, it } from 'vitest';
import {
  CORRELATION_ID_HEADER,
  MAX_CORRELATION_ID_LENGTH,
  MAX_RECENT_CORRELATION_IDS,
  clearCorrelationIds,
  extractCorrelationId,
  getCorrelationId,
  getRecentCorrelationIds,
  rememberResponseCorrelationId,
  sanitizeCorrelationId,
  setCorrelationId,
} from './correlation';

afterEach(() => {
  clearCorrelationIds();
});

describe('CORRELATION_ID_HEADER', () => {
  it('matches the header the backend sets', () => {
    expect(CORRELATION_ID_HEADER).toBe('x-request-id');
  });
});

describe('sanitizeCorrelationId', () => {
  it('accepts a uuid-shaped string', () => {
    expect(sanitizeCorrelationId(' 3f1a5b2c-9d4e-4f6a-8b7c-1d2e3f4a5b6c ')).toBe(
      '3f1a5b2c-9d4e-4f6a-8b7c-1d2e3f4a5b6c',
    );
  });

  it('rejects non-strings, blank strings and over-long values', () => {
    expect(sanitizeCorrelationId(undefined)).toBeNull();
    expect(sanitizeCorrelationId(null)).toBeNull();
    expect(sanitizeCorrelationId(42)).toBeNull();
    expect(sanitizeCorrelationId('   ')).toBeNull();
    expect(sanitizeCorrelationId('x'.repeat(MAX_CORRELATION_ID_LENGTH + 1))).toBeNull();
  });
});

describe('correlation window', () => {
  it('returns null before any id is recorded', () => {
    expect(getCorrelationId()).toBeNull();
    expect(getRecentCorrelationIds()).toEqual([]);
  });

  it('returns the most recently recorded id', () => {
    setCorrelationId('first');
    setCorrelationId('second');
    expect(getCorrelationId()).toBe('second');
  });

  it('ignores unusable values without disturbing the window', () => {
    setCorrelationId('kept');
    expect(setCorrelationId('  ')).toBeNull();
    expect(setCorrelationId(undefined)).toBeNull();
    expect(getRecentCorrelationIds()).toEqual(['kept']);
  });

  it('de-duplicates and keeps the window bounded and most-recent-first', () => {
    setCorrelationId('a');
    setCorrelationId('b');
    setCorrelationId('a');
    setCorrelationId('c');
    setCorrelationId('d');
    setCorrelationId('e');
    setCorrelationId('f');

    const recent = getRecentCorrelationIds();
    expect(recent.length).toBe(MAX_RECENT_CORRELATION_IDS);
    expect(recent).toEqual(['f', 'e', 'd', 'c', 'a']);
    expect(new Set(recent).size).toBe(recent.length);
  });

  it('clears the window', () => {
    setCorrelationId('a');
    clearCorrelationIds();
    expect(getCorrelationId()).toBeNull();
    expect(getRecentCorrelationIds()).toEqual([]);
  });
});

describe('extractCorrelationId', () => {
  it('reads the header from a Headers instance', () => {
    const headers = new Headers({ [CORRELATION_ID_HEADER]: 'header-id' });
    expect(extractCorrelationId(headers)).toBe('header-id');
    expect(getCorrelationId()).toBe('header-id');
  });

  it('reads the header from a plain object case-insensitively', () => {
    expect(extractCorrelationId({ 'X-Request-Id': 'plain-id' })).toBe('plain-id');
  });

  it('falls back to requestId in the response body', () => {
    expect(extractCorrelationId({}, { message: 'boom', requestId: 'body-id' })).toBe('body-id');
  });

  it('prefers the header over the body', () => {
    const headers = new Headers({ [CORRELATION_ID_HEADER]: 'header-id' });
    expect(extractCorrelationId(headers, { requestId: 'body-id' })).toBe('header-id');
  });

  it('returns null when the response carries no correlation id', () => {
    expect(extractCorrelationId({}, { message: 'boom' })).toBeNull();
    expect(extractCorrelationId(undefined)).toBeNull();
    expect(getCorrelationId()).toBeNull();
  });
});

describe('rememberResponseCorrelationId', () => {
  it('records the x-request-id response header', () => {
    const response = { headers: new Headers({ [CORRELATION_ID_HEADER]: 'resp-id' }) };
    expect(rememberResponseCorrelationId(response)).toBe('resp-id');
    expect(getCorrelationId()).toBe('resp-id');
  });

  it('returns null when the response has no headers', () => {
    expect(rememberResponseCorrelationId({ headers: null })).toBeNull();
    expect(rememberResponseCorrelationId({})).toBeNull();
  });
});
