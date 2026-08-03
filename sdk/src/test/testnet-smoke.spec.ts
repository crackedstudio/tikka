/**
 * Live testnet smoke test (#1107)
 *
 * Unit tests with mocks cannot catch protocol drift. This suite hits the real
 * Soroban testnet RPC and simulates a read-only contract call so breakage in
 * network config, RPC wiring, or transaction simulation surfaces early.
 *
 * Skipped by default. Enable with TIKKA_TESTNET_TESTS=1:
 *   TIKKA_TESTNET_TESTS=1 pnpm test -- testnet-smoke
 *   pnpm run test:testnet
 *
 * Windows (PowerShell):
 *   $env:TIKKA_TESTNET_TESTS=1; pnpm test -- testnet-smoke
 */

import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { resolveNetworkConfig } from '../network/network.config';
import { ContractService } from '../contract/contract.service';
import { ContractFn } from '../contract/bindings';

const TESTNET_ENABLED = process.env.TIKKA_TESTNET_TESTS === '1';
const describeTestnet = TESTNET_ENABLED ? describe : describe.skip;

/** Anonymous Soroban account used for read-only simulation. */
const ANON_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** Generous timeout — live RPC calls can be slow. */
const NET_TIMEOUT_MS = 60_000;

describe('testnet smoke opt-in gate', () => {
  it('is skipped by default unless TIKKA_TESTNET_TESTS=1', () => {
    if (TESTNET_ENABLED) {
      expect(describeTestnet).toBe(describe);
    } else {
      expect(describeTestnet).toBe(describe.skip);
    }
  });
});

describeTestnet('testnet smoke (TIKKA_TESTNET_TESTS=1)', () => {
  const networkConfig = resolveNetworkConfig('testnet');
  let rpcService: RpcService;
  let contractService: ContractService;

  beforeAll(() => {
    rpcService = new RpcService(networkConfig);
    const horizonService = new HorizonService(networkConfig);
    contractService = new ContractService(rpcService, horizonService, networkConfig);
  });

  it(
    'resolves testnet config and reaches Soroban RPC',
    async () => {
      expect(networkConfig.network).toBe('testnet');
      expect(networkConfig.rpcUrl).toMatch(/^https?:\/\//);

      const ledger = await rpcService.getLedger();
      expect(ledger).toBeDefined();
      expect(typeof ledger.sequence).toBe('number');
      expect(ledger.sequence).toBeGreaterThan(0);
    },
    NET_TIMEOUT_MS,
  );

  it(
    'builds and simulates a read-only contract call',
    async () => {
      const outcome = await contractService
        .simulate<number[]>(ContractFn.GET_ALL_RAFFLE_IDS, [], {
          sourcePublicKey: ANON_SOURCE,
        })
        .then((sim) => ({ ok: true as const, sim }))
        .catch((err: Error) => ({ ok: false as const, err }));

      if (outcome.ok) {
        expect(typeof outcome.sim.assembledXdr).toBe('string');
        expect(outcome.sim.assembledXdr.length).toBeGreaterThan(0);
        expect(outcome.sim.networkPassphrase).toBe(networkConfig.networkPassphrase);
        expect(typeof outcome.sim.minResourceFee).toBe('string');
        return;
      }

      // Contract may not be deployed or the method may be absent on testnet;
      // a contract-level simulation failure still proves RPC + tx building work.
      expect(outcome.err.message).toMatch(/Simulation failed/i);
    },
    NET_TIMEOUT_MS,
  );
});
