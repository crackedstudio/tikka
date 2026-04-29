/**
 * Property-based tests for apiClient (Token_Store + apiRequest)
 * Feature: siws-auth
 */

import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
