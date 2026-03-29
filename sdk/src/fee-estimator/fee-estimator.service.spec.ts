import { Test, TestingModule } from '@nestjs/testing';
import { BASE_FEE } from '@stellar/stellar-sdk';
import { FeeEstimatorService } from './fee-estimator.service';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { stroopsToXlm } from '../utils/formatting';
import { ContractFn } from '../contract/bindings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_NETWORK_CONFIG = {
  network: 'testnet' as const,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

const MOCK_SOURCE_KEY =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** Minimal Horizon account stub */
const mockAccount = {
  accountId: () => MOCK_SOURCE_KEY,
  sequenceNumber: () => '0',
  incrementSequenceNumber: () => {},
};

/** Minimal xdr.SorobanResources stub */
function makeResources(overrides: Partial<{
  cpuInstructions: number;
  diskReadBytes: number;
  writeBytes: number;
  readOnly: number;
  readWrite: number;
}> = {}) {
  return {
    instructions: () => overrides.cpuInstructions ?? 1_234_567,
    diskReadBytes: () => overrides.diskReadBytes ?? 32768,
    writeBytes: () => overrides.writeBytes ?? 16384,
    footprint: () => ({
      readOnly: () => new Array(overrides.readOnly ?? 2),
      readWrite: () => new Array(overrides.readWrite ?? 1),
    }),
  };
}

/** Successful simulation response stub */
function makeSimSuccess(overrides: Partial<{
  minResourceFee: string;
  cpuInstructions: number;
  diskReadBytes: number;
  writeBytes: number;
  readOnly: number;
  readWrite: number;
  stateChanges: any[];
}> = {}) {
  return {
    minResourceFee: overrides.minResourceFee ?? '50000',
    transactionData: {
      build: () => ({ resources: () => makeResources(overrides) }),
    },
    stateChanges: overrides.stateChanges ?? [
      { type: 'updated' },
      { type: 'created' },
    ],
    result: undefined,
    latestLedger: 1,
    _parsed: true,
  };
}

/** Simulation error response stub */
const SIM_ERROR = {
  error: 'contract execution failed',
  latestLedger: 1,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FeeEstimatorService', () => {
  let service: FeeEstimatorService;
  let rpcService: jest.Mocked<RpcService>;
  let horizonService: jest.Mocked<HorizonService>;

  beforeEach(async () => {
    rpcService = {
      simulateTransaction: jest.fn(),
    } as unknown as jest.Mocked<RpcService>;

    horizonService = {
      loadAccount: jest.fn().mockResolvedValue(mockAccount),
    } as unknown as jest.Mocked<HorizonService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeEstimatorService,
        { provide: RpcService, useValue: rpcService },
        { provide: HorizonService, useValue: horizonService },
        { provide: 'NETWORK_CONFIG', useValue: MOCK_NETWORK_CONFIG },
      ],
    }).compile();

    service = module.get<FeeEstimatorService>(FeeEstimatorService);
  });

  describe('estimateFee', () => {
    it('returns xlm, stroops and resource breakdown on success', async () => {
      rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess({
        minResourceFee: '50000',
        cpuInstructions: 1_234_567,
        diskReadBytes: 32768,
        writeBytes: 16384,
        readOnly: 3,
        readWrite: 2,
      }) as any);

      const result = await service.estimateFee({
        method: ContractFn.BUY_TICKET,
        params: [1, MOCK_SOURCE_KEY, 1],
        sourcePublicKey: MOCK_SOURCE_KEY,
      });

      const expectedStroops = String(BigInt(BASE_FEE) + BigInt(50000));
      expect(result.stroops).toBe(expectedStroops);
      expect(result.xlm).toBe(stroopsToXlm(expectedStroops));

      expect(result.resources.baseFeeStroops).toBe(String(BASE_FEE));
      expect(result.resources.resourceFeeStroops).toBe('50000');
      expect(result.resources.cpuInstructions).toBe(1_234_567);
      expect(result.resources.diskReadBytes).toBe(32768);
      expect(result.resources.writeBytes).toBe(16384);
      expect(result.resources.readOnlyEntries).toBe(3);
      expect(result.resources.readWriteEntries).toBe(2);
    });

    it('converts stroops total to valid XLM string (7 decimal places)', async () => {
      rpcService.simulateTransaction.mockResolvedValue(
        makeSimSuccess({ minResourceFee: '10000000' }) as any,
      );

      const result = await service.estimateFee({
        method: ContractFn.GET_RAFFLE_DATA,
        params: [42],
        sourcePublicKey: MOCK_SOURCE_KEY,
      });

      // 10_000_100 stroops = 1.0000100 XLM
      expect(result.xlm).toMatch(/^\d+\.\d{7}$/);
      expect(parseFloat(result.xlm)).toBeGreaterThan(0);
    });

    it('handles zero resource fee gracefully', async () => {
      rpcService.simulateTransaction.mockResolvedValue(
        makeSimSuccess({
          minResourceFee: '0',
          cpuInstructions: 0,
          diskReadBytes: 0,
          writeBytes: 0,
          readOnly: 0,
          readWrite: 0,
        }) as any,
      );

      const result = await service.estimateFee({
        method: ContractFn.IS_PAUSED,
        params: [],
        sourcePublicKey: MOCK_SOURCE_KEY,
      });

      expect(result.stroops).toBe(String(BASE_FEE));
      expect(result.resources.resourceFeeStroops).toBe('0');
      expect(result.resources.cpuInstructions).toBe(0);
      expect(result.resources.readOnlyEntries).toBe(0);
    });

    it('throws SimulationFailed when RPC returns a simulation error', async () => {
      rpcService.simulateTransaction.mockResolvedValue(SIM_ERROR as any);

      await expect(
        service.estimateFee({
          method: ContractFn.BUY_TICKET,
          params: [99, MOCK_SOURCE_KEY, 5],
          sourcePublicKey: MOCK_SOURCE_KEY,
        }),
      ).rejects.toMatchObject({
        code: TikkaSdkErrorCode.SimulationFailed,
      });
    });

    it('falls back to anonymous key when no wallet and no sourcePublicKey', async () => {
      rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);

      await service.estimateFee({ method: ContractFn.IS_PAUSED, params: [] });

      expect(horizonService.loadAccount).toHaveBeenCalledWith(
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      );
    });

    it('uses wallet public key when no sourcePublicKey is provided', async () => {
      const walletKey = 'GBRAND000000000000000000000000000000000000000000000ABCD';
      const mockWallet = { getPublicKey: jest.fn().mockResolvedValue(walletKey) };
      (service as any).wallet = mockWallet;

      rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);

      await service.estimateFee({ method: ContractFn.IS_PAUSED, params: [] });

      expect(horizonService.loadAccount).toHaveBeenCalledWith(walletKey);
    });

    it('degrades gracefully when transactionData.resources() throws', async () => {
      const simBadResources = {
        ...makeSimSuccess(),
        transactionData: { build: () => { throw new Error('no data'); } },
      };
      rpcService.simulateTransaction.mockResolvedValue(simBadResources as any);

      const result = await service.estimateFee({
        method: ContractFn.IS_PAUSED,
        params: [],
        sourcePublicKey: MOCK_SOURCE_KEY,
      });

      expect(result.resources.cpuInstructions).toBe(0);
      expect(result.resources.diskReadBytes).toBe(0);
      expect(result.resources.readOnlyEntries).toBe(0);
      expect(result.resources.readWriteEntries).toBe(0);
    });
  });

  describe('setContractId', () => {
    it('overrides the contract ID used for transaction building', () => {
      service.setContractId('CUSTOM_CONTRACT_ID');
      expect((service as any).contractId).toBe('CUSTOM_CONTRACT_ID');
    });
  });
});
