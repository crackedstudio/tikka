import { TikkaNetwork } from '../network/network.config';

/**
 * Version metadata tying SDK bindings to a deployed Soroban contract.
 *
 * Update this file whenever you regenerate bindings or deploy a new contract.
 * {@link assertContractPackageCompatible} and contract.compat.spec.ts fail if
 * constants or bindings drift from this metadata.
 */
export const CONTRACT_VERSION_METADATA = {
  /** Bump when the hand-written or generated ABI surface changes. */
  bindingsVersion: '1.0.0',
  /** Event schema version emitted by the deployed contract (matches indexer). */
  eventSchemaVersion: 1,
  /** Network and contract ID used as the source for `stellar contract bindings`. */
  bindingSource: {
    network: 'testnet' as TikkaNetwork,
    contractId:
      'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  },
  /** Default raffle contract IDs per network (env vars override at runtime). */
  contractIds: {
    testnet:
      'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    mainnet: '',
    standalone: '',
  },
} as const;

/** Schema versions the SDK bindings and modules are written against. */
export const SUPPORTED_EVENT_SCHEMA_VERSIONS: ReadonlySet<number> =
  new Set<number>([CONTRACT_VERSION_METADATA.eventSchemaVersion]);

export type ContractVersionMetadata = typeof CONTRACT_VERSION_METADATA;
