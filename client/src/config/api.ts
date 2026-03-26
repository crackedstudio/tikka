/**
 * API Configuration
 * 
 * Central configuration for backend API endpoints
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const API_CONFIG = {
  baseUrl: API_BASE_URL,
  endpoints: {
    auth: {
      nonce: '/auth/nonce',
      verify: '/auth/verify',
    },
    raffles: {
      list: '/raffles',
      detail: (id: string) => `/raffles/${id}`,
      metadata: '/raffles/metadata',
    },
    users: {
      profile: (address: string) => `/users/${address}`,
      history: (address: string) => `/users/${address}/history`,
    },
    leaderboard: '/leaderboard',
    stats: '/stats/platform',
    notifications: {
      subscribe: '/notifications/subscribe',
      unsubscribe: (raffleId: string) => `/notifications/subscribe/${raffleId}`,
      list: '/notifications/subscriptions',
    },
  },
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT || '30000', 10),
} as const;
