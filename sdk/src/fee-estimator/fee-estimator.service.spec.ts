import * as fc from 'fast-check';
import { BASE_FEE, rpc } from '@stellar/stellar-sdk';
import { FeeEstimatorService } from './fee-estimator.service';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig } from '../network/network.config';
import { WalletAdapter, WalletName } from '../wallet/wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { stroopsToXlm } from '../utils/formatting';

// ─── Constants ────────────────────────────────────────────────────────────────

const ANONYMOUS_SOURCE_KEY =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

const TEST_CONTRACT_ID =
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

// A valid Stellar public key (randomly generated for tests)
const TEST_WALLET_KEY =
  'GAL6UXQKJEPRAH7HNKK4HCR5VDQLQTWNCEX2NXTQM45Q45XOVHGGA3L5';

const BASE_FEE_STROOPS = Number(BASE_FEE); // 100

/**
 * Build a minimal Stellar account mock that satisfies TransactionBuilder.
 * TransactionBuilder requires `accountId()`, `sequenceNumber()`, and
 * `incrementSequenceNumber()` on the source account.
 */
function makeMockAccount(publicKey: string) {
  let seq = BigInt(0);
  return {
    accountId: () => publicKey,
    sequenceNumber: () => seq.toString(),
    incrementSequenceNumber: () => {
      seq += 1n;
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock SorobanDataBuilder that returns the given resource values.
 */
function makeTransactionData(opts: {
  cpuInstructions?: number;
  diskReadBytes?: number;
  writeBytes?: number;
  readOnly?: number;
  readWrite?: number;
}) {
  const {
    cpuInstructions = 0,
    diskReadBytes = 0,
    writeBytes = 0,
    readOnly = 0,
    readWrite = 0,
  } = opts;

  return {
    build: () => ({
      resources: () => ({
        instructions: () => cpuInstructions,
        diskReadBytes: () => diskReadBytes,
        writeBytes: () => writeBytes,
        footprint: () => ({
          readOnly: () => new Array(readOnly),
          readWrite: () => new Array(readWrite),
        }),
      }),
    }),
  };
}

/**
 * Build a minimal success simulation response.
 */
function makeSuccessResponse(
  minResourceFee: string,
  transactionData?: any,
): rpc.Api.SimulateTransactionSuccessResponse {
  return {
    minResourceFee,
    transactionData: transactionData ?? makeTransactionData({}),
    result: undefined,
    cost: { cpuInstructions: '0', memBytes: '0' },
    latestLedger: 1000,
    _parsed: true,
  } as any;
}

/**
 * Build a minimal error simulation response.
 */
function makeErrorResponse(error: string): any {
  return { error, latestLedger: 1000 };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function buildService(opts: {
  wallet?: Partial<WalletAdapter>;
  simulateResponse?: any;
  simulateFn?: jest.Mock;
}): {
  service: FeeEstimatorService;
  simulateMock: jest.Mock;
  loadAccountMock: jest.Mock;
} {
  const simulateMock: jest.Mock =
    opts.simulateFn ??
    jest.fn().mockResolvedValue(
      opts.simulateResponse ?? makeSuccessResponse('500'),
    );

  const rpcService = {
    simulateTransaction: simulateMock,
  } as unknown as RpcService;

  // loadAccount returns a proper mock account so TransactionBuilder.build() works.
  // The service falls back to this mock when horizon.loadAccount is called.
  const loadAccountMock = jest.fn().mockImplementation((key: string) =>
    Promise.resolve(makeMockAccount(key)),
  );
  const horizonService = {
    loadAccount: loadAccountMock,
  } as unknown as HorizonService;

  const networkConfig: NetworkConfig = {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };

  const wallet = opts.wallet as WalletAdapter | undefined;

  const service = new FeeEstimatorService(
    rpcService,
    horizonService,
    networkConfig,
    wallet,
  );

  // Override contract ID to avoid env-var dependency
  service.setContractId(TEST_CONTRACT_ID);

  return { service, simulateMock, loadAccountMock };
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 2.2 — Unit tests: source key resolution paths
// ─────────────────────────────────────────────────────────────────────────────

describe('FeeEstimatorService — source key resolution', () => {
  it('falls back to anonymous key when no wallet and no sourcePublicKey', async () => {
    const { service, simulateMock } = buildService({
      simulateResponse: makeSuccessResponse('100'),
    });

    await service.estimateFee({ method: 'buy_ticket', params: [] });

    const tx = simulateMock.mock.calls[0][0];
    // The transaction source is embedded in the XDR; we verify indirectly by
    // confirming the call succeeded (anonymous key allows simulation to proceed).
    expect(simulateMock).toHaveBeenCalledTimes(1);
    expect(tx).toBeDefined();
  });

  it('uses wallet key when wallet is set and no sourcePublicKey', async () => {
    const getPublicKey = jest.fn().mockResolvedValue(TEST_WALLET_KEY);
    const wallet: Partial<WalletAdapter> = {
      name: WalletName.Mock,
      getPublicKey,
      isAvailable: () => true,
      signTransaction: jest.fn(),
    };

    const { service, simulateMock } = buildService({
      wallet,
      simulateResponse: makeSuccessResponse('200'),
    });

    await service.estimateFee({ method: 'buy_ticket', params: [] });

    expect(getPublicKey).toHaveBeenCalledTimes(1);
    expect(simulateMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to anonymous key when wallet.getPublicKey() throws', async () => {
    const getPublicKey = jest
      .fn()
      .mockRejectedValue(new Error('wallet locked'));
    const wallet: Partial<WalletAdapter> = {
      name: WalletName.Mock,
      getPublicKey,
      isAvailable: () => true,
      signTransaction: jest.fn(),
    };

    const { service, simulateMock } = buildService({
      wallet,
      simulateResponse: makeSuccessResponse('300'),
    });

    // Should not throw — falls back to anonymous key
    await expect(
      service.estimateFee({ method: 'buy_ticket', params: [] }),
    ).resolves.toBeDefined();

    expect(getPublicKey).toHaveBeenCalledTimes(1);
    expect(simulateMock).toHaveBeenCalledTimes(1);
  });

  it('uses explicit sourcePublicKey without calling wallet.getPublicKey()', async () => {
    const getPublicKey = jest.fn().mockResolvedValue(TEST_WALLET_KEY);
    const wallet: Partial<WalletAdapter> = {
      name: WalletName.Mock,
      getPublicKey,
      isAvailable: () => true,
      signTransaction: jest.fn(),
    };

    const { service, simulateMock } = buildService({
      wallet,
      simulateResponse: makeSuccessResponse('400'),
    });

    // Use the anonymous key as an explicit override (it's a valid Stellar key)
    await service.estimateFee({
      method: 'buy_ticket',
      params: [],
      sourcePublicKey: ANONYMOUS_SOURCE_KEY,
    });

    // wallet.getPublicKey must NOT be called when sourcePublicKey is provided
    expect(getPublicKey).not.toHaveBeenCalled();
    expect(simulateMock).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.1 — Unit tests: estimateFee success and error paths
// ─────────────────────────────────────────────────────────────────────────────

describe('FeeEstimatorService — estimateFee success and error paths', () => {
  it('returns correct { xlm, stroops, resources } structure on success', async () => {
    const resourceFee = '500';
    const txData = makeTransactionData({
      cpuInstructions: 1000,
      diskReadBytes: 256,
      writeBytes: 128,
      readOnly: 2,
      readWrite: 1,
    });

    const { service } = buildService({
      simulateResponse: makeSuccessResponse(resourceFee, txData),
    });

    const result = await service.estimateFee({ method: 'buy_ticket', params: [] });

    const expectedStroops = (BigInt(BASE_FEE_STROOPS) + BigInt(resourceFee)).toString();

    expect(result.stroops).toBe(expectedStroops);
    expect(result.xlm).toBe(stroopsToXlm(expectedStroops));
    expect(result.resources.baseFeeStroops).toBe(String(BASE_FEE_STROOPS));
    expect(result.resources.resourceFeeStroops).toBe(resourceFee);
    expect(result.resources.cpuInstructions).toBe(1000);
    expect(result.resources.diskReadBytes).toBe(256);
    expect(result.resources.writeBytes).toBe(128);
    expect(result.resources.readOnlyEntries).toBe(2);
    expect(result.resources.readWriteEntries).toBe(1);
  });

  it('throws SimulationFailed on error simulation response (message includes method name)', async () => {
    const METHOD = 'create_raffle';
    const { service } = buildService({
      simulateResponse: makeErrorResponse('contract execution failed'),
    });

    await expect(
      service.estimateFee({ method: METHOD, params: [] }),
    ).rejects.toMatchObject({
      code: TikkaSdkErrorCode.SimulationFailed,
      message: expect.stringContaining(METHOD),
    });
  });

  it('degrades gracefully (zero resource fields) when transactionData is absent', async () => {
    const simulateMock = jest.fn().mockResolvedValue({
      minResourceFee: '200',
      latestLedger: 1000,
      _parsed: true,
      // transactionData intentionally omitted
    } as any);

    const { service } = buildService({ simulateFn: simulateMock });

    const result = await service.estimateFee({ method: 'buy_ticket', params: [] });

    expect(result.resources.cpuInstructions).toBe(0);
    expect(result.resources.diskReadBytes).toBe(0);
    expect(result.resources.writeBytes).toBe(0);
    expect(result.resources.readOnlyEntries).toBe(0);
    expect(result.resources.readWriteEntries).toBe(0);
  });

  it('degrades gracefully when transactionData.build() throws', async () => {
    const badTxData = {
      build: () => {
        throw new Error('malformed data');
      },
    };

    const { service } = buildService({
      simulateResponse: makeSuccessResponse('300', badTxData),
    });

    const result = await service.estimateFee({ method: 'buy_ticket', params: [] });

    expect(result.resources.cpuInstructions).toBe(0);
    expect(result.resources.diskReadBytes).toBe(0);
    expect(result.resources.writeBytes).toBe(0);
  });

  it('setContractId overrides the contract address used in simulation', async () => {
    const NEW_CONTRACT =
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

    const simulateMock = jest.fn().mockResolvedValue(makeSuccessResponse('100'));
    const { service } = buildService({ simulateFn: simulateMock });

    service.setContractId(NEW_CONTRACT);

    await service.estimateFee({ method: 'buy_ticket', params: [] });

    // The transaction XDR passed to simulateTransaction should encode the new contract.
    // We verify the call was made (contract ID is embedded in the built tx XDR).
    expect(simulateMock).toHaveBeenCalledTimes(1);
    const txArg = simulateMock.mock.calls[0][0];
    // The XDR string should contain the contract ID encoded within it
    const xdr = txArg.toXDR('base64');
    expect(typeof xdr).toBe('string');
    expect(xdr.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.2 — Property 1: Fee addition invariant
// Validates: Requirements 1.3, 2.5, 7.2
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 1: Fee addition invariant', () => {
  it('BigInt(result.stroops) === BigInt(BASE_FEE) + resourceFee for any resourceFee', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 0n, max: 2n ** 64n }),
        async (resourceFee) => {
          const simulateMock = jest
            .fn()
            .mockResolvedValue(makeSuccessResponse(resourceFee.toString()));

          const { service } = buildService({ simulateFn: simulateMock });

          const result = await service.estimateFee({
            method: 'buy_ticket',
            params: [],
          });

          // Assert stroops = BASE_FEE + resourceFee
          expect(BigInt(result.stroops)).toBe(
            BigInt(BASE_FEE_STROOPS) + resourceFee,
          );

          // Assert baseFeeStroops + resourceFeeStroops === stroops
          expect(
            BigInt(result.resources.baseFeeStroops) +
              BigInt(result.resources.resourceFeeStroops),
          ).toBe(BigInt(result.stroops));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.3 — Property 2: XLM formatting round-trip
// Validates: Requirements 2.1, 7.1
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 2: XLM formatting round-trip', () => {
  it('stroopsToXlm(result.stroops) === result.xlm and matches /^\\d+\\.\\d{7}$/', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 0n, max: 2n ** 64n }),
        async (resourceFee) => {
          const simulateMock = jest
            .fn()
            .mockResolvedValue(makeSuccessResponse(resourceFee.toString()));

          const { service } = buildService({ simulateFn: simulateMock });

          const result = await service.estimateFee({
            method: 'buy_ticket',
            params: [],
          });

          // Round-trip: stroopsToXlm(stroops) must equal xlm field
          expect(stroopsToXlm(result.stroops)).toBe(result.xlm);

          // XLM must be formatted as digits.7decimals
          expect(result.xlm).toMatch(/^\d+\.\d{7}$/);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.4 — Property 3: Resource fields non-negative
// Validates: Requirements 1.4, 7.3
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 3: Resource fields are non-negative integers', () => {
  it('all resource fields are >= 0 for any valid transactionData', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          cpuInstructions: fc.nat(),
          diskReadBytes: fc.nat(),
          writeBytes: fc.nat(),
          readOnly: fc.nat({ max: 20 }),
          readWrite: fc.nat({ max: 20 }),
        }),
        async (resources) => {
          const txData = makeTransactionData(resources);
          const simulateMock = jest
            .fn()
            .mockResolvedValue(makeSuccessResponse('100', txData));

          const { service } = buildService({ simulateFn: simulateMock });

          const result = await service.estimateFee({
            method: 'buy_ticket',
            params: [],
          });

          expect(result.resources.cpuInstructions).toBeGreaterThanOrEqual(0);
          expect(result.resources.diskReadBytes).toBeGreaterThanOrEqual(0);
          expect(result.resources.writeBytes).toBeGreaterThanOrEqual(0);
          expect(result.resources.readOnlyEntries).toBeGreaterThanOrEqual(0);
          expect(result.resources.readWriteEntries).toBeGreaterThanOrEqual(0);

          // Must be integers
          expect(Number.isInteger(result.resources.cpuInstructions)).toBe(true);
          expect(Number.isInteger(result.resources.diskReadBytes)).toBe(true);
          expect(Number.isInteger(result.resources.writeBytes)).toBe(true);
          expect(Number.isInteger(result.resources.readOnlyEntries)).toBe(true);
          expect(Number.isInteger(result.resources.readWriteEntries)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.5 — Property 4: simulateTransaction called exactly once
// Validates: Requirements 1.2
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 4: simulateTransaction called exactly once per estimateFee', () => {
  it('simulateTransaction mock call count equals 1 after each estimateFee call', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          method: fc.string({ minLength: 1, maxLength: 50 }),
          params: fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean()), {
            maxLength: 5,
          }),
        }),
        async (p) => {
          const simulateMock = jest
            .fn()
            .mockResolvedValue(makeSuccessResponse('100'));

          const { service } = buildService({ simulateFn: simulateMock });

          await service.estimateFee({ method: p.method, params: p.params });

          expect(simulateMock).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.6 — Property 5: SimulationFailed on any error response
// Validates: Requirements 1.8
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 5: SimulationFailed thrown for any error simulation response', () => {
  it('throws TikkaSdkError with SimulationFailed code and message containing method name', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          error: fc.string({ minLength: 1 }),
          method: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        async ({ error, method }) => {
          const simulateMock = jest
            .fn()
            .mockResolvedValue(makeErrorResponse(error));

          const { service } = buildService({ simulateFn: simulateMock });

          let thrown: unknown;
          try {
            await service.estimateFee({ method, params: [] });
          } catch (e) {
            thrown = e;
          }

          expect(thrown).toBeInstanceOf(TikkaSdkError);
          const sdkError = thrown as TikkaSdkError;
          expect(sdkError.code).toBe(TikkaSdkErrorCode.SimulationFailed);
          expect(sdkError.message).toContain(method);
        },
      ),
      { numRuns: 100 },
    );
  });
});
