import { ContractFn } from './bindings';
import { EXPECTED_CONTRACT_FUNCTIONS } from './bindings.manifest';
import { DEFAULT_CONTRACT_IDS } from './constants';
import {
  CONTRACT_VERSION_METADATA,
  SUPPORTED_EVENT_SCHEMA_VERSIONS,
} from './contract-version';
import { CONTRACT_ADDRESSES } from './constants';
import {
  assertBindingsMatchManifest,
  assertContractPackageCompatible,
  getBindingsFunctionNames,
} from './contract.compat';

describe('contract package compatibility', () => {
  it('assertContractPackageCompatible passes for the current tree', () => {
    expect(() => assertContractPackageCompatible()).not.toThrow();
  });

  it('bindings expose every manifest function exactly once', () => {
    expect(new Set(getBindingsFunctionNames())).toEqual(
      new Set(EXPECTED_CONTRACT_FUNCTIONS),
    );
    expect(Object.keys(ContractFn).length).toBe(
      EXPECTED_CONTRACT_FUNCTIONS.length,
    );
  });

  it('default contract IDs match version metadata', () => {
    expect(DEFAULT_CONTRACT_IDS).toEqual(
      CONTRACT_VERSION_METADATA.contractIds,
    );
  });

  it('assertBindingsMatchManifest throws when function sets diverge', () => {
    expect(() =>
      assertBindingsMatchManifest(getBindingsFunctionNames(), [
        ...EXPECTED_CONTRACT_FUNCTIONS,
        'stale_method',
      ]),
    ).toThrow(/Bindings\/manifest function count mismatch/);
  });

  it('CONTRACT_ADDRESSES defaults match metadata when env overrides are unset', () => {
    const envKeys = [
      'TIKKA_CONTRACT_TESTNET',
      'TIKKA_CONTRACT_MAINNET',
      'TIKKA_CONTRACT_STANDALONE',
    ] as const;
    if (envKeys.some((key) => process.env[key])) {
      return;
    }
    expect(CONTRACT_ADDRESSES.testnet.raffle).toBe(
      CONTRACT_VERSION_METADATA.contractIds.testnet,
    );
    expect(CONTRACT_ADDRESSES.mainnet.raffle).toBe(
      CONTRACT_VERSION_METADATA.contractIds.mainnet,
    );
    expect(CONTRACT_ADDRESSES.standalone.raffle).toBe(
      CONTRACT_VERSION_METADATA.contractIds.standalone,
    );
  });
});

describe('CONTRACT_VERSION_METADATA', () => {
  it('documents supported contract version fields', () => {
    expect(CONTRACT_VERSION_METADATA.bindingsVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CONTRACT_VERSION_METADATA.eventSchemaVersion).toBeGreaterThan(0);
    expect(CONTRACT_VERSION_METADATA.bindingSource.network).toBe('testnet');
    expect(CONTRACT_VERSION_METADATA.bindingSource.contractId).toMatch(/^C[A-Z0-9]{55}$/);
    expect(CONTRACT_VERSION_METADATA.contractIds.testnet).toBe(
      CONTRACT_VERSION_METADATA.bindingSource.contractId,
    );
  });

  it('lists the event schema version in SUPPORTED_EVENT_SCHEMA_VERSIONS', () => {
    expect(SUPPORTED_EVENT_SCHEMA_VERSIONS).toContain(
      CONTRACT_VERSION_METADATA.eventSchemaVersion,
    );
  });
});
