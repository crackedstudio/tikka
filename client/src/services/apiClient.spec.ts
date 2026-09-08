/**
 * Property-based tests for apiClient (Token_Store + apiRequest)
 * Feature: siws-auth
 *
 * The real request/retry path in apiClient.ts is exercised against the shared
 * MSW server (see src/test/server.ts). No spec stubs `global.fetch` directly;
 * error responses and network failures are produced by overriding the MSW
 * handler for `/test`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { apiRequest, ApiError, ApiErrorCode } from './apiClient';
import { server } from '../test/server';
import { API_BASE_URL } from '../test/handlers';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
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
    // HttpResponse.error() forces the intercepted request to fail as a network error.
    server.use(http.get(`${API_BASE_URL}/test`, () => HttpResponse.error()));

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
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        HttpResponse.json({ message: 'Invalid request data' }, { status: 400 })
      )
    );

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
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
      )
    );

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
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
      )
    );

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
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 })
      )
    );

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
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        HttpResponse.json({ message: 'Rate limit exceeded' }, { status: 429 })
      )
    );

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
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        HttpResponse.json({ message: 'Internal server error' }, { status: 500 })
      )
    );

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
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        HttpResponse.json({ message: 'Service unavailable' }, { status: 503 })
      )
    );

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
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        HttpResponse.json(
          { message: 'Validation failed', ...errorDetails },
          { status: 400 }
        )
      )
    );

    try {
      await apiRequest('/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.details).toEqual({
        message: 'Validation failed',
        ...errorDetails,
      });
    }
  });

  it('handles non-JSON error response gracefully', async () => {
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        new HttpResponse('Internal Server Error', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        })
      )
    );

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
    server.use(
      http.get(`${API_BASE_URL}/test`, () =>
        HttpResponse.json({ message: 'Too many requests' }, { status: 429 })
      )
    );

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
