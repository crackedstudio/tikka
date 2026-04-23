/**
 * Environment configuration for tikka-backend.
 * Using getters ensures environment variables are read at runtime,
 * avoiding issues where they might be cached before values are loaded.
 *
 * Stellar network fields align with Nest `ConfigService` after `env.schema` validation.
 * Prefer `ConfigService` in injectable services for INDEXER_URL / timeouts;
 * use this module for `stellar` resolution and non-DI contexts.
 */
import {
  resolveIndexerBaseUrl,
  resolveStellarContractId,
  resolveStellarHorizonUrl,
  resolveStellarNetworkId,
  resolveStellarNetworkPassphrase,
} from './stellar.constants';

function envLikeFromProcess(): Record<string, string | undefined> {
  return { ...process.env };
}

export const env = {
  get supabase() {
    return {
      url: process.env.SUPABASE_URL ?? '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    };
  },
  get indexer() {
    const envLike = envLikeFromProcess();
    return {
      url: resolveIndexerBaseUrl(envLike),
      timeoutMs: parseInt(process.env.INDEXER_TIMEOUT_MS ?? '5000', 10),
    };
  },
  get stellar() {
    const envLike = envLikeFromProcess();
    const network = resolveStellarNetworkId(envLike);
    return {
      network,
      horizonUrl: resolveStellarHorizonUrl(envLike),
      networkPassphrase: resolveStellarNetworkPassphrase(envLike),
      contractId: resolveStellarContractId(envLike),
    };
  },
  get jwt() {
    return {
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    };
  },
  get siws() {
    return {
      domain: process.env.SIWS_DOMAIN ?? 'tikka.io',
    };
  },
  fcm: {
    enabled: process.env.FCM_ENABLED === 'true',
    serviceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON ?? undefined,
    serviceAccountPath: process.env.FCM_SERVICE_ACCOUNT_PATH ?? undefined,
  },
} as const;
