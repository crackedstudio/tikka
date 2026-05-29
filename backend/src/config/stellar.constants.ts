/**
 * Stellar network identifiers and defaults (Horizon, passphrase, indexer base URL).
 * Used by env validation and runtime env.config getters so behavior stays aligned.
 */
export const STELLAR_NETWORK_IDS = ['testnet', 'mainnet'] as const;

/**
 * Whitelisted asset codes accepted for ticket prices.
 * Extend via ALLOWED_TICKET_ASSETS env var (comma-separated codes, e.g. "XLM,USDC,yXLM").
 */
export const DEFAULT_ALLOWED_TICKET_ASSETS = ['XLM', 'USDC', 'yXLM'] as const;
export type AllowedTicketAsset = (typeof DEFAULT_ALLOWED_TICKET_ASSETS)[number];

/**
 * Returns the effective asset whitelist, merging the default list with any
 * additional codes supplied via the ALLOWED_TICKET_ASSETS environment variable.
 */
export function resolveAllowedTicketAssets(
  envLike: Record<string, string | undefined> = process.env,
): string[] {
  const extra = envLike.ALLOWED_TICKET_ASSETS?.trim();
  if (!extra) return [...DEFAULT_ALLOWED_TICKET_ASSETS];
  const extras = extra.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const merged = new Set([...DEFAULT_ALLOWED_TICKET_ASSETS.map((a) => a.toUpperCase()), ...extras]);
  return Array.from(merged);
}

/**
 * Returns true when the given asset code is on the whitelist.
 */
export function isAllowedTicketAsset(
  code: string,
  envLike: Record<string, string | undefined> = process.env,
): boolean {
  return resolveAllowedTicketAssets(envLike).includes(code.toUpperCase());
}
export type StellarNetworkId = (typeof STELLAR_NETWORK_IDS)[number];

export const STELLAR_NETWORK_DEFAULTS: Record<
  StellarNetworkId,
  {
    horizonUrl: string;
    networkPassphrase: string;
    /** Base URL when INDEXER_URL is unset — override INDEXER_URL in production. */
    defaultIndexerUrl: string;
    /** Placeholder; set STELLAR_CONTRACT_ID for your deployment. */
    contractId: string;
  }
> = {
  testnet: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    defaultIndexerUrl: 'http://localhost:3002',
    contractId: '',
  },
  mainnet: {
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    defaultIndexerUrl: 'http://localhost:3002',
    contractId: '',
  },
};

function normalizeNetwork(
  raw: string | undefined,
): StellarNetworkId {
  const n = (raw ?? 'testnet').toLowerCase();
  return n === 'mainnet' ? 'mainnet' : 'testnet';
}

/** Resolve network id from a loose env record (e.g. validate() input merged with process.env). */
export function resolveStellarNetworkId(
  envLike: Record<string, string | undefined>,
): StellarNetworkId {
  return normalizeNetwork(envLike.STELLAR_NETWORK);
}

/** Indexer API base URL: explicit INDEXER_URL wins, else per-network default. */
export function resolveIndexerBaseUrl(
  envLike: Record<string, string | undefined>,
): string {
  const explicit = envLike.INDEXER_URL?.trim();
  if (explicit) return explicit;
  const network = resolveStellarNetworkId(envLike);
  return STELLAR_NETWORK_DEFAULTS[network].defaultIndexerUrl;
}

export function resolveStellarHorizonUrl(
  envLike: Record<string, string | undefined>,
): string {
  const override = envLike.STELLAR_HORIZON_URL?.trim();
  if (override) return override;
  const network = resolveStellarNetworkId(envLike);
  return STELLAR_NETWORK_DEFAULTS[network].horizonUrl;
}

export function resolveStellarContractId(
  envLike: Record<string, string | undefined>,
): string {
  const override = envLike.STELLAR_CONTRACT_ID?.trim();
  if (override) return override;
  const network = resolveStellarNetworkId(envLike);
  return STELLAR_NETWORK_DEFAULTS[network].contractId;
}

export function resolveStellarNetworkPassphrase(
  envLike: Record<string, string | undefined>,
): string {
  const network = resolveStellarNetworkId(envLike);
  return STELLAR_NETWORK_DEFAULTS[network].networkPassphrase;
}
