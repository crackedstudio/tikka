/**
 * Property-based tests for apiClient (Token_Store + apiRequest)
 * Feature: siws-auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { getToken, setToken, clearToken, apiRequest } from './apiClient';

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
