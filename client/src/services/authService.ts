/**
 * Auth Service
 * 
 * Handles Sign In With Stellar (SIWS) authentication flow:
 * 1. Get nonce from backend
 * 2. Sign message with wallet
 * 3. Verify signature and receive JWT
 */

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
 * Fetch a nonce and SIWS message for the given address
 */
export async function getNonce(address: string): Promise<NonceResponse> {
  const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth.nonce}?address=${encodeURIComponent(address)}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to get nonce' }));
    throw new Error(error.message || 'Failed to get nonce');
  }

  return response.json();
}

/**
 * Verify the signed message and receive a JWT
 */
export async function verify(request: VerifyRequest): Promise<VerifyResponse> {
  const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth.verify}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Verification failed' }));
    throw new Error(error.message || 'Verification failed');
  }

  return response.json();
}
