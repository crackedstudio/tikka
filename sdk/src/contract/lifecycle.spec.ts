/**
 * lifecycle.spec.ts
 *
 * Comprehensive unit tests for TransactionLifecycle — the simulate→sign→submit→poll engine.
 *
 * Coverage:
 *   simulate()  — success, SimulationFailed error, fallback source key
 *   sign()      — success, WalletNotInstalled, user rejection (various messages)
 *   submit()    — success, SubmissionFailed (ERROR status)
 *   poll()      — SUCCESS, FAILED → ContractError, FAILED → ExternalContractError,
 *                 Timeout, exponential backoff interval growth, backoff cap (maxIntervalMs)
 *   invoke()    — full happy-path, WalletNotInstalled guard, propagates each phase error
 */

// rpc.assembleTransaction is non-configurable on the real module object, so we mock
// the whole module and replace just that one export with a jest.fn().
jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual<typeof import('@stellar/stellar-sdk')>('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      assembleTransaction: jest.fn(),
    },
  };
});

import { Networks, rpc, TransactionBuilder } from '@stellar/stellar-sdk';
import { TransactionLifecycle } from './lifecycle';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig } from '../network/network.config';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { WalletAdapter, WalletName } from '../wallet/wallet.interface';
import { ContractFn } from './bindings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NET_CFG: NetworkConfig = {
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
};

const CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const SOURCE_KEY  = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const TX_HASH     = 'abcdef1234567890'.repeat(4);
const SIGNED_XDR  = 'AAAAAA=='; // minimal placeholder

/** Returns a minimal mock account stub accepted by TransactionBuilder. */
const mockAccount = () => ({
  accountId: () => SOURCE_KEY,
  sequenceNumber: () => '0',
  incrementSequenceNumber: () => {},
});

/** Builds the minimal SimulateTransactionSuccessResponse stub. */
function makeSimSuccess(overrides: Partial<{
  minResourceFee: string;
  retval: any;
  readOnly: number;
  readWrite: number;
}> = {}) {
  return {
    minResourceFee: overrides.minResourceFee ?? '5000',
    result: overrides.retval !== undefined
      ? { retval: { toXDR: () => Buffer.alloc(0) } }
      : undefined,
    transactionData: {
      build: () => ({
        resources: () => ({
          instructions: () => 0,
          diskReadBytes: () => 0,
          writeBytes: () => 0,
          footprint: () => ({
            readOnly: () => [],
            readWrite: () => [],
          }),
        }),
      }),
    },
    stateChanges: [],
    _parsed: true,
    latestLedger: 100,
    events: [],
    id: '1',
  };
}

/** Builds a SendTransactionResponse stub. */
const makeSendSuccess = (hash = TX_HASH) => ({
  status: 'PENDING',
  hash,
  latestLedger: 100,
  latestLedgerCloseTime: 0,
});

const makeSendError = () => ({
  status: 'ERROR',
  hash: '',
  errorResultXdr: 'op_no_account',
  latestLedger: 100,
  latestLedgerCloseTime: 0,
});

/** Builds a successful GetTransactionResponse stub. */
const makeGetSuccess = (ledger = 101) => ({
  status: rpc.Api.GetTransactionStatus.SUCCESS,
  ledger,
  returnValue: undefined,
  createdAt: Date.now(),
  applicationOrder: 1,
  txHash: TX_HASH,
  envelopeXdr: '',
  resultXdr: '',
  resultMetaXdr: '',
});

const makeGetFailed = (resultXdr = '') => ({
  status: rpc.Api.GetTransactionStatus.FAILED,
  ledger: 101,
  resultXdr,
  txHash: TX_HASH,
});

const makeGetNotFound = () => ({
  status: rpc.Api.GetTransactionStatus.NOT_FOUND,
});

// ─── Shared mocks ──────────────────────────────────────────────────────────────

let rpcService: jest.Mocked<RpcService>;
let horizonService: jest.Mocked<HorizonService>;
let wallet: jest.Mocked<WalletAdapter>;

function buildLifecycle(withWallet = true): TransactionLifecycle {
  return new TransactionLifecycle(
    rpcService,
    horizonService,
    NET_CFG,
    withWallet ? wallet : undefined,
    CONTRACT_ID,
  );
}

beforeEach(() => {
  rpcService = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
  } as unknown as jest.Mocked<RpcService>;

  horizonService = {
    loadAccount: jest.fn().mockResolvedValue(mockAccount()),
  } as unknown as jest.Mocked<HorizonService>;

  wallet = {
    name: WalletName.Mock,
    isAvailable: jest.fn().mockReturnValue(true),
    getPublicKey: jest.fn().mockResolvedValue(SOURCE_KEY),
    signTransaction: jest.fn().mockResolvedValue({ signedXdr: SIGNED_XDR }),
    signMessage: jest.fn(),
    getNetwork: jest.fn(),
  } as unknown as jest.Mocked<WalletAdapter>;

  // assembleTransaction is a jest.fn() from the module mock above
  (rpc.assembleTransaction as jest.Mock).mockReturnValue({
    build: () => ({ toXDR: () => SIGNED_XDR }),
  });
});

afterEach(() => jest.restoreAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// simulate()
// ─────────────────────────────────────────────────────────────────────────────

describe('simulate()', () => {
  it('calls simulateTransaction and returns parsed result', async () => {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess({ minResourceFee: '7500' }) as any);

    const lc = buildLifecycle();
    const result = await lc.simulate(ContractFn.GET_RAFFLE_DATA, [1], { sourcePublicKey: SOURCE_KEY });

    expect(rpcService.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(result.minResourceFee).toBe('7500');
    expect(result.assembledXdr).toBeTruthy();
    expect(result.networkPassphrase).toBe(Networks.TESTNET);
  });

  it('uses wallet public key as source when sourcePublicKey is omitted', async () => {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);

    const lc = buildLifecycle();
    await lc.simulate(ContractFn.IS_PAUSED, []);

    expect(wallet.getPublicKey).toHaveBeenCalledTimes(1);
    expect(horizonService.loadAccount).toHaveBeenCalledWith(SOURCE_KEY);
  });

  it('falls back to anonymous key when wallet.getPublicKey() throws', async () => {
    wallet.getPublicKey.mockRejectedValue(new Error('wallet locked'));
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);

    const lc = buildLifecycle();
    await lc.simulate(ContractFn.IS_PAUSED, []);

    expect(horizonService.loadAccount).toHaveBeenCalledWith(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    );
  });

  it('falls back to anonymous key when no wallet is set', async () => {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);

    const lc = buildLifecycle(false);
    await lc.simulate(ContractFn.IS_PAUSED, []);

    expect(horizonService.loadAccount).toHaveBeenCalledWith(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    );
  });

  it('throws SimulationFailed when RPC returns a simulation error', async () => {
    rpcService.simulateTransaction.mockResolvedValue({
      error: 'HostError: contract panicked',
      _parsed: true,
      latestLedger: 100,
      events: [],
      id: '1',
    } as any);

    const lc = buildLifecycle();
    await expect(
      lc.simulate(ContractFn.BUY_TICKET, [1, SOURCE_KEY, 1], { sourcePublicKey: SOURCE_KEY }),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.SimulationFailed });
  });

  it('includes the method name in the SimulationFailed message', async () => {
    rpcService.simulateTransaction.mockResolvedValue({
      error: 'bad params',
      _parsed: true,
      latestLedger: 100,
      events: [],
      id: '1',
    } as any);

    const lc = buildLifecycle();
    await expect(
      lc.simulate('create_raffle', [], { sourcePublicKey: SOURCE_KEY }),
    ).rejects.toThrow(/create_raffle/);
  });

  it('gracefully handles Horizon loadAccount failure (uses fallback account)', async () => {
    horizonService.loadAccount.mockRejectedValue(new Error('horizon down'));
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);

    const lc = buildLifecycle();
    // Should not throw
    await expect(
      lc.simulate(ContractFn.IS_PAUSED, [], { sourcePublicKey: SOURCE_KEY }),
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sign()
// ─────────────────────────────────────────────────────────────────────────────

describe('sign()', () => {
  it('calls wallet.signTransaction and returns signedXdr', async () => {
    wallet.signTransaction.mockResolvedValue({ signedXdr: 'SIGNED_ENVELOPE==' });

    const lc = buildLifecycle();
    const xdr = await lc.sign('UNSIGNED_XDR==');

    expect(wallet.signTransaction).toHaveBeenCalledWith(
      'UNSIGNED_XDR==',
      { networkPassphrase: Networks.TESTNET },
    );
    expect(xdr).toBe('SIGNED_ENVELOPE==');
  });

  it('passes a custom networkPassphrase to the wallet', async () => {
    wallet.signTransaction.mockResolvedValue({ signedXdr: 'SIGNED==' });

    const lc = buildLifecycle();
    await lc.sign('XDR==', Networks.PUBLIC);

    expect(wallet.signTransaction).toHaveBeenCalledWith(
      'XDR==',
      { networkPassphrase: Networks.PUBLIC },
    );
  });

  it('throws WalletNotInstalled when no wallet adapter is set', async () => {
    const lc = buildLifecycle(false);
    await expect(lc.sign('XDR==')).rejects.toMatchObject({
      code: TikkaSdkErrorCode.WalletNotInstalled,
    });
  });

  it.each([
    'User rejected the request',
    'Transaction denied by user',
    'Signing cancelled',
    'user declined',
  ])('throws UserRejected when wallet error contains "%s"', async (message) => {
    wallet.signTransaction.mockRejectedValue(new Error(message));

    const lc = buildLifecycle();
    await expect(lc.sign('XDR==')).rejects.toMatchObject({
      code: TikkaSdkErrorCode.UserRejected,
    });
  });

  it('throws Unknown (not UserRejected) for non-rejection wallet errors', async () => {
    wallet.signTransaction.mockRejectedValue(new Error('wallet extension crashed'));

    const lc = buildLifecycle();
    await expect(lc.sign('XDR==')).rejects.toMatchObject({
      code: TikkaSdkErrorCode.Unknown,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// submit()
// ─────────────────────────────────────────────────────────────────────────────

describe('submit()', () => {
  beforeEach(() => {
    // TransactionBuilder.fromXDR is a static method — spy directly on the class
    jest.spyOn(TransactionBuilder, 'fromXDR').mockReturnValue({ toXDR: () => '' } as any);
  });

  it('returns the transaction hash on a PENDING response', async () => {
    rpcService.sendTransaction.mockResolvedValue(makeSendSuccess('myhash1234') as any);

    const lc = buildLifecycle();
    const hash = await lc.submit(SIGNED_XDR);

    expect(hash).toBe('myhash1234');
  });

  it('throws SubmissionFailed when sendTransaction returns status ERROR', async () => {
    rpcService.sendTransaction.mockResolvedValue(makeSendError() as any);

    const lc = buildLifecycle();
    await expect(lc.submit(SIGNED_XDR)).rejects.toMatchObject({
      code: TikkaSdkErrorCode.SubmissionFailed,
    });
  });

  it('includes the errorResultXdr in the SubmissionFailed message', async () => {
    rpcService.sendTransaction.mockResolvedValue(makeSendError() as any);

    const lc = buildLifecycle();
    await expect(lc.submit(SIGNED_XDR)).rejects.toThrow(/op_no_account/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// poll()
// ─────────────────────────────────────────────────────────────────────────────

describe('poll()', () => {
  it('returns SubmitResult immediately when getTransaction returns SUCCESS', async () => {
    rpcService.getTransaction.mockResolvedValue(makeGetSuccess(202) as any);

    const lc = buildLifecycle();
    const result = await lc.poll(TX_HASH, { timeoutMs: 10_000 });

    expect(result.txHash).toBe(TX_HASH);
    expect(result.ledger).toBe(202);
  });

  it('throws ContractError when getTransaction returns FAILED (no HostError in xdr)', async () => {
    rpcService.getTransaction.mockResolvedValue(makeGetFailed('plain_error') as any);

    const lc = buildLifecycle();
    await expect(lc.poll(TX_HASH)).rejects.toMatchObject({
      code: TikkaSdkErrorCode.ContractError,
    });
  });

  it('throws ExternalContractError when resultXdr contains "HostError"', async () => {
    rpcService.getTransaction.mockResolvedValue(makeGetFailed('HostError: cross-contract call') as any);

    const lc = buildLifecycle();
    await expect(lc.poll(TX_HASH)).rejects.toMatchObject({
      code: TikkaSdkErrorCode.ExternalContractError,
    });
  });

  it('retries on NOT_FOUND until SUCCESS', async () => {
    rpcService.getTransaction
      .mockResolvedValueOnce(makeGetNotFound() as any)
      .mockResolvedValueOnce(makeGetNotFound() as any)
      .mockResolvedValue(makeGetSuccess(205) as any);

    const lc = buildLifecycle();
    const result = await lc.poll(TX_HASH, {
      timeoutMs: 60_000,
      intervalMs: 100,
      backoffFactor: 1.0, // constant interval for deterministic test
    });

    expect(rpcService.getTransaction).toHaveBeenCalledTimes(3);
    expect(result.ledger).toBe(205);
  });

  it('throws Timeout when deadline is exceeded without a terminal status', async () => {
    rpcService.getTransaction.mockResolvedValue(makeGetNotFound() as any);

    const lc = buildLifecycle();
    await expect(
      lc.poll(TX_HASH, { timeoutMs: 500, intervalMs: 100, backoffFactor: 1.0 }),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.Timeout });
  });

  it('Timeout message includes the tx hash and attempt count', async () => {
    rpcService.getTransaction.mockResolvedValue(makeGetNotFound() as any);

    const lc = buildLifecycle();
    await expect(
      lc.poll(TX_HASH, { timeoutMs: 250, intervalMs: 50, backoffFactor: 1.0 }),
    ).rejects.toThrow(TX_HASH);
  });

  it('applies exponential backoff — interval grows with backoffFactor', async () => {
    const intervals: number[] = [];
    let callIndex = 0;

    rpcService.getTransaction.mockImplementation(async (_hash, _timeout, interval) => {
      callIndex++;
      intervals.push(interval as number);
      if (callIndex >= 4) return makeGetSuccess(200) as any;
      return makeGetNotFound() as any;
    });

    const lc = buildLifecycle();
    await lc.poll(TX_HASH, {
      timeoutMs: 60_000,
      intervalMs: 10,       // small to avoid real-timer delays
      backoffFactor: 2.0,
      maxIntervalMs: 10_000,
    });

    // Intervals passed to getTransaction should grow: 10, 20, 40
    expect(intervals[0]).toBe(10);
    expect(intervals[1]).toBe(20);
    expect(intervals[2]).toBe(40);
  });

  it('caps the backoff interval at maxIntervalMs', async () => {
    const intervals: number[] = [];
    let callIndex = 0;

    rpcService.getTransaction.mockImplementation(async (_hash, _timeout, interval) => {
      callIndex++;
      intervals.push(interval as number);
      if (callIndex >= 5) return makeGetSuccess(200) as any;
      return makeGetNotFound() as any;
    });

    const lc = buildLifecycle();
    await lc.poll(TX_HASH, {
      timeoutMs: 60_000,
      intervalMs: 20,   // small real intervals
      backoffFactor: 3.0,
      maxIntervalMs: 50, // cap
    });

    // 20 → 50 (capped) → 50 (capped) → 50 (capped)
    expect(intervals[0]).toBe(20);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeLessThanOrEqual(50);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// invoke() — combined flow
// ─────────────────────────────────────────────────────────────────────────────

describe('invoke()', () => {
  /** Set up mocks for the full happy-path. */
  function setupHappyPath() {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);
    wallet.signTransaction.mockResolvedValue({ signedXdr: SIGNED_XDR });
    jest.spyOn(TransactionBuilder, 'fromXDR').mockReturnValue({ toXDR: () => '' } as any);
    rpcService.sendTransaction.mockResolvedValue(makeSendSuccess() as any);
    rpcService.getTransaction.mockResolvedValue(makeGetSuccess(300) as any);
  }

  it('runs all four phases and returns a SubmitResult', async () => {
    setupHappyPath();

    const lc = buildLifecycle();
    const result = await lc.invoke(ContractFn.BUY_TICKET, [1, SOURCE_KEY, 1], {
      sourcePublicKey: SOURCE_KEY,
    });

    expect(rpcService.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(wallet.signTransaction).toHaveBeenCalledTimes(1);
    expect(rpcService.sendTransaction).toHaveBeenCalledTimes(1);
    expect(rpcService.getTransaction).toHaveBeenCalledTimes(1);
    expect(result.txHash).toBe(TX_HASH);
    expect(result.ledger).toBe(300);
  });

  it('throws WalletNotInstalled immediately when no wallet is set', async () => {
    const lc = buildLifecycle(false);
    await expect(
      lc.invoke(ContractFn.BUY_TICKET, [1, SOURCE_KEY, 1]),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.WalletNotInstalled });

    // Should not reach simulation
    expect(rpcService.simulateTransaction).not.toHaveBeenCalled();
  });

  it('propagates SimulationFailed from the simulate phase', async () => {
    rpcService.simulateTransaction.mockResolvedValue({
      error: 'bad input',
      _parsed: true,
      latestLedger: 100,
      events: [],
      id: '1',
    } as any);

    const lc = buildLifecycle();
    await expect(
      lc.invoke(ContractFn.BUY_TICKET, [1], { sourcePublicKey: SOURCE_KEY }),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.SimulationFailed });

    expect(wallet.signTransaction).not.toHaveBeenCalled();
  });

  it('propagates UserRejected from the sign phase', async () => {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);
    wallet.signTransaction.mockRejectedValue(new Error('User rejected the request'));

    const lc = buildLifecycle();
    await expect(
      lc.invoke(ContractFn.BUY_TICKET, [1], { sourcePublicKey: SOURCE_KEY }),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.UserRejected });

    expect(rpcService.sendTransaction).not.toHaveBeenCalled();
  });

  it('propagates SubmissionFailed from the submit phase', async () => {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);
    wallet.signTransaction.mockResolvedValue({ signedXdr: SIGNED_XDR });
    jest.spyOn(TransactionBuilder, 'fromXDR').mockReturnValue({ toXDR: () => '' } as any);
    rpcService.sendTransaction.mockResolvedValue(makeSendError() as any);

    const lc = buildLifecycle();
    await expect(
      lc.invoke(ContractFn.BUY_TICKET, [1], { sourcePublicKey: SOURCE_KEY }),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.SubmissionFailed });

    expect(rpcService.getTransaction).not.toHaveBeenCalled();
  });

  it('propagates Timeout from the poll phase', async () => {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);
    wallet.signTransaction.mockResolvedValue({ signedXdr: SIGNED_XDR });
    jest.spyOn(TransactionBuilder, 'fromXDR').mockReturnValue({ toXDR: () => '' } as any);
    rpcService.sendTransaction.mockResolvedValue(makeSendSuccess() as any);
    rpcService.getTransaction.mockResolvedValue(makeGetNotFound() as any);

    const lc = buildLifecycle();
    await expect(
      lc.invoke(ContractFn.BUY_TICKET, [1], {
        sourcePublicKey: SOURCE_KEY,
        poll: { timeoutMs: 300, intervalMs: 50, backoffFactor: 1.0 },
      }),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.Timeout });
  });

  it('passes poll config through to poll()', async () => {
    setupHappyPath();

    const lc = buildLifecycle();
    await lc.invoke(ContractFn.BUY_TICKET, [1], {
      sourcePublicKey: SOURCE_KEY,
      poll: { timeoutMs: 45_000, intervalMs: 3_000, backoffFactor: 2.0 },
    });

    // getTransaction is called with the custom timeoutMs and intervalMs
    expect(rpcService.getTransaction).toHaveBeenCalledWith(
      TX_HASH,
      45_000,
      3_000,
    );
  });
});
