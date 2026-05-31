import { BASE_FEE, rpc } from '@stellar/stellar-sdk';
import { FeeEstimatorService } from './fee-estimator.service';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig } from '../network/network.config';
import { TikkaSdkErrorCode } from '../utils/errors';
import { FeeQuote } from './fee-estimator.types';

const BASE_FEE_STROOPS = Number(BASE_FEE); // 100

const TEST_CONTRACT_ID =
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

function makeMockAccount(publicKey: string) {
  let seq = BigInt(0);
  return {
    accountId: () => publicKey,
    sequenceNumber: () => seq.toString(),
    incrementSequenceNumber: () => { seq += 1n; },
  };
}

function makeTransactionData(opts: {
  cpuInstructions?: number;
  diskReadBytes?: number;
  writeBytes?: number;
  readOnly?: number;
  readWrite?: number;
} = {}) {
  const {
    cpuInstructions = 1000,
    diskReadBytes = 256,
    writeBytes = 128,
    readOnly = 2,
    readWrite = 1,
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

function makeSuccessResponse(
  minResourceFee: string,
  transactionData = makeTransactionData(),
): rpc.Api.SimulateTransactionSuccessResponse {
  return {
    minResourceFee,
    transactionData,
    result: undefined,
    cost: { cpuInstructions: '0', memBytes: '0' },
    latestLedger: 1000,
    _parsed: true,
  } as any;
}

function buildService(simulateFn: jest.Mock): FeeEstimatorService {
  const rpcService = { simulateTransaction: simulateFn } as unknown as RpcService;
  const loadAccountMock = jest
    .fn()
    .mockImplementation((key: string) => Promise.resolve(makeMockAccount(key)));
  const horizonService = { loadAccount: loadAccountMock } as unknown as HorizonService;
  const networkConfig: NetworkConfig = {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };
  const service = new FeeEstimatorService(rpcService, horizonService, networkConfig);
  service.setContractId(TEST_CONTRACT_ID);
  return service;
}

// ─── Simulation success path ──────────────────────────────────────────────────

describe('getFeeQuote — simulation success', () => {
  it('returns source=simulation, confidence=high, no warnings on success', async () => {
    const simulate = jest.fn().mockResolvedValue(makeSuccessResponse('500'));
    const service = buildService(simulate);

    const quote = await service.getFeeQuote({ method: 'buy_ticket', params: [] });

    expect(quote.source).toBe('simulation');
    expect(quote.confidence).toBe('high');
    expect(quote.warnings).toHaveLength(0);
  });

  it('sets expiresAt ~30s in the future by default', async () => {
    const before = Date.now();
    const simulate = jest.fn().mockResolvedValue(makeSuccessResponse('500'));
    const service = buildService(simulate);

    const quote = await service.getFeeQuote({ method: 'buy_ticket', params: [] });

    expect(quote.expiresAt).toBeGreaterThanOrEqual(before + 29_000);
    expect(quote.expiresAt).toBeLessThanOrEqual(Date.now() + 31_000);
  });

  it('respects custom staleAfterMs', async () => {
    const simulate = jest.fn().mockResolvedValue(makeSuccessResponse('500'));
    const service = buildService(simulate);
    const before = Date.now();

    const quote = await service.getFeeQuote({
      method: 'buy_ticket',
      params: [],
      staleAfterMs: 5_000,
    });

    expect(quote.expiresAt).toBeGreaterThanOrEqual(before + 4_000);
    expect(quote.expiresAt).toBeLessThanOrEqual(Date.now() + 6_000);
  });

  it('includes correct stroops and xlm from simulation', async () => {
    const resourceFee = '800';
    const simulate = jest.fn().mockResolvedValue(makeSuccessResponse(resourceFee));
    const service = buildService(simulate);

    const quote = await service.getFeeQuote({ method: 'buy_ticket', params: [] });

    const expected = (BigInt(BASE_FEE_STROOPS) + BigInt(resourceFee)).toString();
    expect(quote.stroops).toBe(expected);
    expect(quote.xlm).toMatch(/^\d+\.\d{7}$/);
  });

  it('includes resource breakdown from simulation', async () => {
    const txData = makeTransactionData({ cpuInstructions: 5000, readOnly: 3 });
    const simulate = jest
      .fn()
      .mockResolvedValue(makeSuccessResponse('1000', txData));
    const service = buildService(simulate);

    const quote = await service.getFeeQuote({ method: 'buy_ticket', params: [] });

    expect(quote.resources.cpuInstructions).toBe(5000);
    expect(quote.resources.readOnlyEntries).toBe(3);
  });
});

// ─── Fallback path ────────────────────────────────────────────────────────────

describe('getFeeQuote — fallback when simulation fails', () => {
  it('returns source=fallback, confidence=low, FALLBACK_ESTIMATE warning', async () => {
    const simulate = jest.fn().mockRejectedValue(new Error('RPC unavailable'));
    const service = buildService(simulate);

    const quote = await service.getFeeQuote({ method: 'buy_ticket', params: [] });

    expect(quote.source).toBe('fallback');
    expect(quote.confidence).toBe('low');
    expect(quote.warnings).toHaveLength(1);
    expect(quote.warnings[0].code).toBe('FALLBACK_ESTIMATE');
    expect(quote.warnings[0].message).toBeTruthy();
  });

  it('fallback stroops equals BASE_FEE + 50000', async () => {
    const simulate = jest.fn().mockRejectedValue(new Error('timeout'));
    const service = buildService(simulate);

    const quote = await service.getFeeQuote({ method: 'buy_ticket', params: [] });

    const expectedStroops = (BigInt(BASE_FEE_STROOPS) + BigInt(50_000)).toString();
    expect(quote.stroops).toBe(expectedStroops);
  });

  it('fallback quote still has valid expiresAt', async () => {
    const before = Date.now();
    const simulate = jest.fn().mockRejectedValue(new Error('net error'));
    const service = buildService(simulate);

    const quote = await service.getFeeQuote({ method: 'buy_ticket', params: [] });

    expect(quote.expiresAt).toBeGreaterThan(before);
  });

  it('fallback resource fields are all zero', async () => {
    const simulate = jest.fn().mockRejectedValue(new Error('fail'));
    const service = buildService(simulate);

    const quote = await service.getFeeQuote({ method: 'buy_ticket', params: [] });

    expect(quote.resources.cpuInstructions).toBe(0);
    expect(quote.resources.diskReadBytes).toBe(0);
    expect(quote.resources.writeBytes).toBe(0);
    expect(quote.resources.readOnlyEntries).toBe(0);
    expect(quote.resources.readWriteEntries).toBe(0);
  });
});

// ─── Stale quote ─────────────────────────────────────────────────────────────

describe('isQuoteStale', () => {
  it('returns false for a fresh quote', async () => {
    const simulate = jest.fn().mockResolvedValue(makeSuccessResponse('500'));
    const service = buildService(simulate);
    const quote = await service.getFeeQuote({ method: 'buy_ticket', params: [] });

    expect(service.isQuoteStale(quote)).toBe(false);
  });

  it('returns true when nowMs is past expiresAt', async () => {
    const simulate = jest.fn().mockResolvedValue(makeSuccessResponse('500'));
    const service = buildService(simulate);
    const quote = await service.getFeeQuote({
      method: 'buy_ticket',
      params: [],
      staleAfterMs: 1_000,
    });

    expect(service.isQuoteStale(quote, quote.expiresAt + 1)).toBe(true);
  });

  it('returns true exactly at expiry', async () => {
    const simulate = jest.fn().mockResolvedValue(makeSuccessResponse('500'));
    const service = buildService(simulate);
    const quote = await service.getFeeQuote({
      method: 'buy_ticket',
      params: [],
      staleAfterMs: 1_000,
    });

    expect(service.isQuoteStale(quote, quote.expiresAt)).toBe(true);
  });
});

// ─── Max-fee guard ────────────────────────────────────────────────────────────

describe('getFeeQuote — max-fee guard', () => {
  it('adds MAX_FEE_EXCEEDED warning and downgrades confidence when fee exceeds limit', async () => {
    const simulate = jest.fn().mockResolvedValue(makeSuccessResponse('10000'));
    const service = buildService(simulate);

    // Set ceiling below the expected total (100 + 10000 = 10100)
    const quote = await service.getFeeQuote({
      method: 'buy_ticket',
      params: [],
      maxFeeStroops: '5000',
    });

    expect(quote.confidence).toBe('low');
    const warning = quote.warnings.find(w => w.code === 'MAX_FEE_EXCEEDED');
    expect(warning).toBeDefined();
    expect(warning!.message).toContain('10100');
    expect(warning!.message).toContain('5000');
  });

  it('does not add MAX_FEE_EXCEEDED when fee is within limit', async () => {
    const simulate = jest.fn().mockResolvedValue(makeSuccessResponse('500'));
    const service = buildService(simulate);

    const quote = await service.getFeeQuote({
      method: 'buy_ticket',
      params: [],
      maxFeeStroops: '99999',
    });

    expect(quote.warnings.every(w => w.code !== 'MAX_FEE_EXCEEDED')).toBe(true);
    expect(quote.confidence).toBe('high');
  });

  it('adds both FALLBACK_ESTIMATE and MAX_FEE_EXCEEDED when simulation fails and fallback exceeds limit', async () => {
    const simulate = jest.fn().mockRejectedValue(new Error('fail'));
    const service = buildService(simulate);

    // Fallback is 50100 stroops; set ceiling to 100
    const quote = await service.getFeeQuote({
      method: 'buy_ticket',
      params: [],
      maxFeeStroops: '100',
    });

    const codes = quote.warnings.map(w => w.code);
    expect(codes).toContain('FALLBACK_ESTIMATE');
    expect(codes).toContain('MAX_FEE_EXCEEDED');
    expect(quote.confidence).toBe('low');
  });
});
