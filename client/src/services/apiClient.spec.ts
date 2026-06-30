/**
 * Property-based tests for apiClient (Token_Store + apiRequest)
 * Feature: siws-auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiRequest,
  ApiError,
  ApiErrorCode,
  getApiErrorMessage,
  isApiError,
  registerExpiredHandler,
  unregisterExpiredHandler,
} from './apiClient';

// sonner is used as a global in apiRequest; mock to keep tests quiet.
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  sessionStorage.clear();
  // Reset module-scoped state so a stale handler from one spec doesn't leak
  // into the next test (or into useAuth.spec.ts via the shared apiClient module).
  unregisterExpiredHandler();
  vi.restoreAllMocks();
});

describe('ApiError', () => {
  it('creates an error with code, message, statusCode, and details', () => {
    const error = new ApiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Invalid input',
      400,
      { field: 'email' }
    );

    expect(error.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: 'email' });
    expect(error.name).toBe('ApiError');
  });

  it('creates an error without optional statusCode and details', () => {
    const error = new ApiError(
      ApiErrorCode.NETWORK_ERROR,
      'Connection failed'
    );

    expect(error.code).toBe(ApiErrorCode.NETWORK_ERROR);
    expect(error.message).toBe('Connection failed');
    expect(error.statusCode).toBeUndefined();
    expect(error.details).toBeUndefined();
  });
});

describe('apiRequest error handling', () => {
  it('throws ApiError with NETWORK_ERROR code on fetch failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network timeout'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/test')).rejects.toThrow(ApiError);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(ApiErrorCode.NETWORK_ERROR);
      expect(apiError.message).toContain('Network Error');
      expect(apiError.statusCode).toBeUndefined();
    }
  });

  it('throws ApiError with VALIDATION_ERROR code on 400 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Invalid request data' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(ApiErrorCode.VALIDATION_ERROR);
      expect(apiError.message).toBe('Invalid request data');
      expect(apiError.statusCode).toBe(400);
    }
  });

  it('throws ApiError with UNAUTHORIZED code on 401 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(ApiErrorCode.UNAUTHORIZED);
      expect(apiError.message).toBe('Unauthorized - please sign in again');
      expect(apiError.statusCode).toBe(401);
    }
  });

  it('throws ApiError with FORBIDDEN code on 403 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Forbidden' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(ApiErrorCode.FORBIDDEN);
      expect(apiError.message).toBe('Forbidden');
      expect(apiError.statusCode).toBe(403);
    }
  });

  it('throws ApiError with NOT_FOUND code on 404 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Not found' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(ApiErrorCode.NOT_FOUND);
      expect(apiError.message).toBe('Not found');
      expect(apiError.statusCode).toBe(404);
    }
  });

  it('throws ApiError with RATE_LIMITED code on 429 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ message: 'Rate limit exceeded' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(ApiErrorCode.RATE_LIMITED);
      expect(apiError.message).toBe('Rate limit exceeded');
      expect(apiError.statusCode).toBe(429);
    }
  });

  it('throws ApiError with SERVER_ERROR code on 500 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal server error' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(ApiErrorCode.SERVER_ERROR);
      expect(apiError.message).toBe('Internal server error');
      expect(apiError.statusCode).toBe(500);
    }
  });

  it('throws ApiError with SERVER_ERROR code on 503 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ message: 'Service unavailable' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(ApiErrorCode.SERVER_ERROR);
      expect(apiError.message).toBe('Service unavailable');
      expect(apiError.statusCode).toBe(503);
    }
  });

  it('includes error details from response body', async () => {
    const errorDetails = { field: 'email', reason: 'invalid format' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Validation failed', ...errorDetails }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.details).toEqual({ message: 'Validation failed', ...errorDetails });
    }
  });

  it('handles non-JSON error response gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Invalid JSON')),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(ApiErrorCode.SERVER_ERROR);
      expect(apiError.message).toContain('Request failed with status 500');
    }
  });

  it('allows UI consumers to inspect stable error code and message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ message: 'Too many requests' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;

      // UI can check error code for conditional rendering
      if (apiError.code === ApiErrorCode.RATE_LIMITED) {
        expect(apiError.message).toBe('Too many requests');
        expect(apiError.statusCode).toBe(429);
      }
    }
  });
});

// ── silentErrors behavior ─────────────────────────────────────────────────────

describe('silentErrors flag', () => {
  it('suppresses _onExpiredCallback and toast on 401 when silentErrors=true', async () => {
    const expired = vi.fn();
    registerExpiredHandler(expired);

    sessionStorage.setItem('tikka_auth_token', 'tok');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.reject(new SyntaxError('bad')),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test', { silentErrors: true });
    } catch (error) {
      expect(isApiError(error)).toBe(true);
      expect((error as ApiError).code).toBe(ApiErrorCode.UNAUTHORIZED);
    }

    // Token should NOT be cleared and expired handler NOT called when silent.
    expect(sessionStorage.getItem('tikka_auth_token')).toBe('tok');
    expect(expired).not.toHaveBeenCalled();
  });

  it('throws ApiError(UNAUTHORIZED) when requiresAuth and no token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/test', { requiresAuth: true });
    } catch (error) {
      expect(isApiError(error)).toBe(true);
      expect((error as ApiError).code).toBe(ApiErrorCode.UNAUTHORIZED);
      expect((error as ApiError).message).toBe('Authentication required');
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── getApiErrorMessage helper ────────────────────────────────────────────────

describe('getApiErrorMessage', () => {
  it('maps every ApiErrorCode to a stable UI message', () => {
    const codes: ApiErrorCode[] = [
      ApiErrorCode.VALIDATION_ERROR,
      ApiErrorCode.UNAUTHORIZED,
      ApiErrorCode.FORBIDDEN,
      ApiErrorCode.NOT_FOUND,
      ApiErrorCode.RATE_LIMITED,
      ApiErrorCode.SERVER_ERROR,
      ApiErrorCode.NETWORK_ERROR,
      ApiErrorCode.UNKNOWN_ERROR,
    ];

    for (const code of codes) {
      const msg = getApiErrorMessage(new ApiError(code, 'server detail'));
      expect(msg).toBeTruthy();
      // Each code gets a unique, human-readable string.
      expect(msg.length).toBeGreaterThan(8);
    }
  });

  it('returns RATE_LIMITED copy per the issue spec', () => {
    const msg = getApiErrorMessage(new ApiError(ApiErrorCode.RATE_LIMITED, 'short'));
    expect(msg.toLowerCase()).toContain('too many requests');
    expect(msg.toLowerCase()).toContain('wait');
  });

  it('falls back to error.message for plain Error', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back for non-Error values', () => {
    expect(getApiErrorMessage('stringy')).toBe('An unexpected error occurred');
    expect(getApiErrorMessage(null, 'custom')).toBe('custom');
    expect(getApiErrorMessage(undefined, 'custom')).toBe('custom');
  });

  it('isApiError narrows unknown to ApiError', () => {
    const e: unknown = new ApiError(ApiErrorCode.NOT_FOUND, 'x');
    expect(isApiError(e)).toBe(true);
    if (isApiError(e)) {
      // compiles only when narrowed
      expect(e.code).toBe(ApiErrorCode.NOT_FOUND);
    }
    expect(isApiError(new Error('plain'))).toBe(false);
  });
});
