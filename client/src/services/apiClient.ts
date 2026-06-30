/**
 * API Client
 *
 * Centralized HTTP client with automatic JWT token injection
 * All protected API calls should use this client
 *
 * Source order matters: `ApiErrorCode` and `ApiError` are declared BEFORE
 * the `ERROR_MESSAGES` catalog and the `getApiErrorMessage`/`isApiError`
 * helpers that reference them. A reverse order would throw at module load
 * because the enum is in TDZ when the helper is initialized.
 */

import { API_CONFIG } from "../config/api";
import { toast } from "sonner";

// ─── Typed API Error Types ────────────────────────────────────────────────────

/**
 * Error codes for different types of API failures
 */
export enum ApiErrorCode {
  /** Validation error (400) - invalid request data */
  VALIDATION_ERROR = "VALIDATION_ERROR",
  /** Authentication required or failed (401) */
  UNAUTHORIZED = "UNAUTHORIZED",
  /** Forbidden - insufficient permissions (403) */
  FORBIDDEN = "FORBIDDEN",
  /** Resource not found (404) */
  NOT_FOUND = "NOT_FOUND",
  /** Rate limit exceeded (429) */
  RATE_LIMITED = "RATE_LIMITED",
  /** Server error (500-599) */
  SERVER_ERROR = "SERVER_ERROR",
  /** Network failure or timeout */
  NETWORK_ERROR = "NETWORK_ERROR",
  /** Unknown or unexpected error */
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Typed error envelope for API failures
 * Provides stable error codes and messages for UI consumers
 */
export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public statusCode?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Map HTTP status codes to ApiErrorCode
 */
function mapStatusCodeToErrorCode(status: number): ApiErrorCode {
  if (status === 400) return ApiErrorCode.VALIDATION_ERROR;
  if (status === 401) return ApiErrorCode.UNAUTHORIZED;
  if (status === 403) return ApiErrorCode.FORBIDDEN;
  if (status === 404) return ApiErrorCode.NOT_FOUND;
  if (status === 429) return ApiErrorCode.RATE_LIMITED;
  if (status >= 500 && status < 600) return ApiErrorCode.SERVER_ERROR;
  return ApiErrorCode.UNKNOWN_ERROR;
}

// ─── UI message catalog + helpers (depend on types above) ────────────────────

/**
 * Stable user-facing copy keyed by ApiErrorCode.
 * Hooks select the right message via `getApiErrorMessage(err)` so the UI never
 * has to switch on HTTP statuses or string matches.
 */
const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  [ApiErrorCode.VALIDATION_ERROR]: "Please check your input and try again.",
  [ApiErrorCode.UNAUTHORIZED]: "Your session has expired. Please sign in again.",
  [ApiErrorCode.FORBIDDEN]: "You don't have permission to perform this action.",
  [ApiErrorCode.NOT_FOUND]: "The requested resource was not found.",
  [ApiErrorCode.RATE_LIMITED]: "Too many requests, please wait a moment and try again.",
  [ApiErrorCode.SERVER_ERROR]: "Something went wrong on our end. Please try again later.",
  [ApiErrorCode.NETWORK_ERROR]: "Network error. Please check your connection and try again.",
  [ApiErrorCode.UNKNOWN_ERROR]: "An unexpected error occurred.",
};

/**
 * Map any thrown value to a user-facing string.
 * - `ApiError` → uses ERROR_MESSAGES for the code, falls back to the server message.
 * - Other `Error` → its `.message`.
 * - Anything else (string, object, null) → `fallback`.
 */
export function getApiErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred",
): string {
  if (err instanceof ApiError) {
    return ERROR_MESSAGES[err.code] ?? err.message ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * Type guard for `ApiError`. Useful when callers need to branch on `err.code`.
 */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

// ─── Token storage ────────────────────────────────────────────────────────────

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

// ── Session-expiry pub/sub bridge ─────────────────────────────────────────────
// Allows AuthProvider to be notified when a 401 is received without importing
// React hooks into the service layer.

let _onExpiredCallback: (() => void) | null = null;

/**
 * Register a callback to be invoked when any API request returns HTTP 401.
 * AuthProvider registers auth.markExpired here on mount.
 */
export function registerExpiredHandler(fn: () => void): void {
  _onExpiredCallback = fn;
}

/**
 * Remove the previously registered 401 callback.
 * AuthProvider calls this on unmount.
 */
export function unregisterExpiredHandler(): void {
  _onExpiredCallback = null;
}

export interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
  /**
   * If true, suppresses global toast notifications AND the session-expired
   * callback. Use for background polling and one-off retries where the caller
   * handles error UX itself.
   */
  silentErrors?: boolean;
}

/**
 * Make an authenticated API request
 * Automatically adds Authorization header if token is available
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { requiresAuth = false, silentErrors = false, headers = {}, ...fetchOptions } = options;

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
    // Surface a typed ApiError (UNAUTHORIZED) so callers' instanceof checks work.
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, "Authentication required");
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

    // Global Error Toast Notification for Network Failures (unless silenced)
    if (!silentErrors) {
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
    }
    throw new ApiError(
      ApiErrorCode.NETWORK_ERROR,
      `Network Error: ${errorMessage}`,
      undefined,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }

  if (!response.ok) {
    const errorCode = mapStatusCodeToErrorCode(response.status);
    let errorData: { message?: string; status?: number; [key: string]: unknown } = {
      message: `Request failed with status ${response.status}`,
      status: response.status,
    };

    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object") {
        errorData = parsed as { message?: string; status?: number; [key: string]: unknown };
      }
    } catch {
      errorData = {
        message: `Request failed with status ${response.status}`,
        status: response.status,
      };
    }

    const errorMessage =
      typeof errorData.message === "string" && errorData.message.trim().length > 0
        ? errorData.message
        : "Request failed";

    // Handle 401 Unauthorized - clear token, notify auth layer, and throw.
    // Skip the side-effects when the caller opted into silentErrors (e.g. the
    // SIWS flow hitting /auth/* endpoints, where a 401 means a bad nonce, not
    // an expired session).
    if (response.status === 401) {
      if (!silentErrors) {
        clearToken();
        _onExpiredCallback?.();
        toast.error("Session expired", {
          description: "Please sign in again to continue.",
          action: { label: "Sign In", onClick: () => window.location.reload() },
        });
      }
      throw new ApiError(
        ApiErrorCode.UNAUTHORIZED,
        "Unauthorized - please sign in again",
        401,
        errorData,
      );
    }

    // Global Error Toast Notification with Actions (unless silenced)
    if (!silentErrors) {
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
    }

    throw new ApiError(errorCode, errorMessage, response.status, errorData);
  }

  // Handle empty responses and JSON parsing defensively.
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (contentType.includes("application/json") || typeof response.json === "function") {
    try {
      return (await response.json()) as T;
    } catch {
      return {} as T;
    }
  }

  return {} as T;
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
