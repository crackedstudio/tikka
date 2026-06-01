import { TikkaNetwork } from '../network/network.config';
import { CONTRACT_VERSION_METADATA } from './contract-version';

/** Default raffle contract IDs (see contract-version.ts). */
export const DEFAULT_CONTRACT_IDS = CONTRACT_VERSION_METADATA.contractIds;

/**
 * Raffle contract addresses per network.
 *
 * Defaults come from {@link CONTRACT_VERSION_METADATA}. Override per environment
 * with `TIKKA_CONTRACT_<NETWORK>` (for example `TIKKA_CONTRACT_TESTNET`).
 */
export const CONTRACT_ADDRESSES: Record<
  TikkaNetwork,
  { raffle: string; factory?: string }
> = {
  testnet: {
    raffle:
      process.env.TIKKA_CONTRACT_TESTNET ?? DEFAULT_CONTRACT_IDS.testnet,
    factory: process.env.TIKKA_FACTORY_TESTNET,
  },
  mainnet: {
    raffle:
      process.env.TIKKA_CONTRACT_MAINNET ?? DEFAULT_CONTRACT_IDS.mainnet,
    factory: process.env.TIKKA_FACTORY_MAINNET,
  },
  standalone: {
    raffle:
      process.env.TIKKA_CONTRACT_STANDALONE ??
      DEFAULT_CONTRACT_IDS.standalone,
    factory: process.env.TIKKA_FACTORY_STANDALONE,
  },
};

/**
 * Returns the raffle contract ID for the given network.
 */
export function getRaffleContractId(network: TikkaNetwork): string {
  const addr = CONTRACT_ADDRESSES[network]?.raffle;
  if (!addr) {
    throw new Error(
      `Raffle contract address not configured for network "${network}". ` +
        'Set TIKKA_CONTRACT_<NETWORK> env var or pass it via SDK options.',
    );
  }
  return addr;
}
