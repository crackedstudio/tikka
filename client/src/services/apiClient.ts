/**
 * API Client
 *
 * Centralized HTTP client with automatic JWT token injection
 * All protected API calls should use this client
 */

import { API_CONFIG } from "../config/api";
import { toast } from "sonner";

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

  const timeoutMs = typeof API_CONFIG.timeout === 'number' ? API_CONFIG.timeout : 8000;

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers: requestHeaders,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Network error occurred";

    // Global Error Toast Notification for Network Failures
    toast.error("API Connection Failed", {
      id: "network-error-toast",
      description: errorMessage,
      action: {
        label: "Retry",
        onClick: () => window.location.reload(),
      },
      cancel: {
        label: "Copy Error",
        onClick: () => {
          navigator.clipboard.writeText(
            JSON.stringify({ endpoint: url, error: errorMessage }, null, 2)
          );
          toast.success("Error copied to clipboard", { duration: 2000 });
        },
      },
    });
    throw new Error(`Network Error: ${errorMessage}`);
  }

  if (!response.ok) {
    // Handle 401 Unauthorized - clear token and throw
    if (response.status === 401) {
      clearToken();
      toast.error("Unauthorized", {
        description: "Please sign in again to continue.",
        action: { label: "Sign In", onClick: () => window.location.reload() },
      });
      throw new Error("Unauthorized - please sign in again");
    }

    const errorData = await response.json().catch(() => ({
      message: `Request failed with status ${response.status}`,
      status: response.status,
    }));

    const errorMessage = errorData.message || "Request failed";

    // Global Error Toast Notification with Actions
    toast.error("API Request Failed", {
      id: "api-error-toast",
      description: errorMessage,
      action: {
        label: "Retry",
        onClick: () => window.location.reload(), // Simple retry mechanism
      },
      cancel: {
        label: "Copy Error",
        onClick: () => {
          navigator.clipboard.writeText(
            JSON.stringify(
              { endpoint: url, status: response.status, error: errorData },
              null,
              2
            )
          );
          toast.success("Error copied to clipboard", { duration: 2000 });
        },
      },
    });

    throw new Error(errorMessage);
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
