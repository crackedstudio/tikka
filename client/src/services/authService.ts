/**
 * Auth Service
 *
 * Handles Sign In With Stellar (SIWS) authentication flow:
 * 1. Get nonce from backend
 * 2. Sign message with wallet
 * 3. Verify signature and receive JWT
 *
 * All requests go through `apiRequest`, so failures are thrown as `ApiError`.
 * The SIWS flow happens before any JWT exists and a 401 from /auth/* means
 * "bad nonce/signature", NOT "session expired" — hence `silentErrors: true`.
 */

import { api, ApiError } from './apiClient';
import { API_CONFIG } from '../config/api';

export interface NonceResponse {
  nonce: string;
  expiresAt: string;
  issuedAt: string;
  message: string;
}

export interface VerifyRequest {
  address: string;
  signature: string;
  nonce: string;
  issuedAt?: string;
}

export interface VerifyResponse {
  accessToken: string;
}

/**
 * Fetch a nonce and SIWS message for the given address.
 * Throws `ApiError` on failure (code reflects HTTP status).
 */
export async function getNonce(address: string): Promise<NonceResponse> {
  const endpoint = `${API_CONFIG.endpoints.auth.nonce}?address=${encodeURIComponent(address)}`;
  try {
    return await api.get<NonceResponse>(endpoint, { silentErrors: true });
  } catch (error) {
    if (error instanceof ApiError) {
      const detailMessage =
        typeof (error.details as { message?: unknown } | undefined)?.message === "string"
          ? (error.details as { message: string }).message
          : undefined;
      const fallbackMessage = detailMessage && !detailMessage.startsWith("Request failed with status")
        ? detailMessage
        : "Failed to get nonce";
      throw new ApiError(
        error.code,
        fallbackMessage,
        error.statusCode,
        error.details,
      );
    }
    throw new Error(error instanceof Error ? error.message : "Failed to get nonce");
  }
}

/**
 * Verify the signed message and receive a JWT.
 * Throws `ApiError` on failure (code reflects HTTP status).
 */
export async function verify(request: VerifyRequest): Promise<VerifyResponse> {
  try {
    return await api.post<VerifyResponse>(
      API_CONFIG.endpoints.auth.verify,
      request,
      { silentErrors: true },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      const detailMessage =
        typeof (error.details as { message?: unknown } | undefined)?.message === "string"
          ? (error.details as { message: string }).message
          : undefined;
      const fallbackMessage = detailMessage && !detailMessage.startsWith("Request failed with status")
        ? detailMessage
        : "Verification failed";
      throw new ApiError(
        error.code,
        fallbackMessage,
        error.statusCode,
        error.details,
      );
    }
    throw new Error(error instanceof Error ? error.message : "Verification failed");
  }
}
