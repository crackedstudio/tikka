import { ContractFn } from './bindings';
import { EXPECTED_CONTRACT_FUNCTIONS } from './bindings.manifest';
import { CONTRACT_ADDRESSES } from './constants';
import {
  CONTRACT_VERSION_METADATA,
  SUPPORTED_EVENT_SCHEMA_VERSIONS,
} from './contract-version';
import { TikkaNetwork } from '../network/network.config';

const NETWORKS: TikkaNetwork[] = ['testnet', 'mainnet', 'standalone'];

function contractEnvKey(network: TikkaNetwork): string {
  return `TIKKA_CONTRACT_${network.toUpperCase()}`;
}

/**
 * Sorted Soroban function names exported from bindings.ts.
 */
export function getBindingsFunctionNames(): string[] {
  return Object.values(ContractFn).sort();
}

/**
 * Throws when sorted binding and manifest function name lists differ.
 */
export function assertBindingsMatchManifest(
  bindings: readonly string[],
  manifest: readonly string[],
): void {
  const sortedBindings = [...bindings].sort();
  const sortedManifest = [...manifest].sort();

  if (sortedBindings.length !== sortedManifest.length) {
    throw new Error(
      `Bindings/manifest function count mismatch: bindings=${sortedBindings.length}, manifest=${sortedManifest.length}`,
    );
  }

  for (let i = 0; i < sortedBindings.length; i++) {
    if (sortedBindings[i] !== sortedManifest[i]) {
      throw new Error(
        `Bindings/manifest mismatch at index ${i}: bindings="${sortedBindings[i]}", manifest="${sortedManifest[i]}"`,
      );
    }
  }
}

/**
 * Throws when hand-written bindings, manifest, constants, or schema metadata disagree.
 */
export function assertContractPackageCompatible(): void {
  assertBindingsMatchManifest(
    getBindingsFunctionNames(),
    EXPECTED_CONTRACT_FUNCTIONS,
  );

  const { bindingSource, contractIds, eventSchemaVersion } =
    CONTRACT_VERSION_METADATA;

  if (bindingSource.contractId !== contractIds[bindingSource.network]) {
    throw new Error(
      `bindingSource.contractId does not match contractIds.${bindingSource.network}`,
    );
  }

  if (!SUPPORTED_EVENT_SCHEMA_VERSIONS.has(eventSchemaVersion)) {
    throw new Error(
      `eventSchemaVersion ${eventSchemaVersion} is not in SUPPORTED_EVENT_SCHEMA_VERSIONS`,
    );
  }

  for (const network of NETWORKS) {
    if (process.env[contractEnvKey(network)]) {
      continue;
    }
    const expected = contractIds[network];
    const actual = CONTRACT_ADDRESSES[network]?.raffle ?? '';
    if (actual !== expected) {
      throw new Error(
        `CONTRACT_ADDRESSES.${network}.raffle "${actual}" does not match ` +
          `contractIds.${network} "${expected}"`,
      );
    }
  }
}
