/**
 * API Client
 *
 * Centralized HTTP client with automatic JWT token injection
 * All protected API calls should use this client
 */

import { API_CONFIG } from "../config/api";

/**
 * Get the stored JWT token
 */
export function getToken(): string | null {
  return sessionStorage.getItem("tikka_auth_token");
}

/**
 * Store the JWT token
 */
export function setToken(token: string): void {
  sessionStorage.setItem("tikka_auth_token", token);
}

/**
 * Clear the JWT token
 */
export function clearToken(): void {
  sessionStorage.removeItem("tikka_auth_token");
}

export interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

/**
 * Make an authenticated API request
 * Automatically adds Authorization header if token is available
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { requiresAuth = false, headers = {}, ...fetchOptions } = options;

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_CONFIG.baseUrl}${endpoint}`;

  const isFormData = fetchOptions.body instanceof FormData;

  const requestHeaders: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(headers as Record<string, string>),
  };

  // Add Authorization header if token exists
  const token = getToken();
  if (token) {
    requestHeaders["Authorization"] = `Bearer ${token}`;
  } else if (requiresAuth) {
    throw new Error("Authentication required");
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: requestHeaders,
  });

  if (!response.ok) {
    // Handle 401 Unauthorized - clear token and throw
    if (response.status === 401) {
      clearToken();
      throw new Error("Unauthorized - please sign in again");
    }

    const error = await response.json().catch(() => ({
      message: `Request failed with status ${response.status}`,
    }));
    throw new Error(error.message || "Request failed");
  }

  // Handle empty responses
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return {} as T;
  }

  return response.json();
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = any>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "GET" }),

  post: <T = any>(endpoint: string, data?: any, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "POST",
      body:
        data instanceof FormData
          ? data
          : data
            ? JSON.stringify(data)
            : undefined,
    }),

  put: <T = any>(endpoint: string, data?: any, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "PUT",
      body:
        data instanceof FormData
          ? data
          : data
            ? JSON.stringify(data)
            : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "DELETE" }),
};
