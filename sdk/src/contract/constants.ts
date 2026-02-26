import { TikkaNetwork } from '../network/network.config';

/**
 * Raffle contract addresses per network.
 *
 * Update these after each deployment. The factory address is used when
 * deploying new raffle instances; the main raffle address is the current
 * canonical raffle contract.
 */
export const CONTRACT_ADDRESSES: Record<
  TikkaNetwork,
  { raffle: string; factory?: string }
> = {
  testnet: {
    raffle:
      process.env.TIKKA_CONTRACT_TESTNET ??
      'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', // placeholder
    factory: process.env.TIKKA_FACTORY_TESTNET,
  },
  mainnet: {
    raffle:
      process.env.TIKKA_CONTRACT_MAINNET ??
      '', // set after mainnet deployment
    factory: process.env.TIKKA_FACTORY_MAINNET,
  },
  standalone: {
    raffle:
      process.env.TIKKA_CONTRACT_STANDALONE ??
      '', // local dev
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
