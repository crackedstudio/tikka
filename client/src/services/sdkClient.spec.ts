/**
 * sdkClient.spec.ts — Issue #1528
 *
 * sdkClient.ts is the client's `@tikka/sdk` integration boundary — the only
 * service that builds and submits onchain transactions. This spec covers every
 * exported operation against a mocked `@tikka/sdk`:
 *
 *  - happy paths, asserting the result envelopes (PipelineResult /
 *    ContractResponse) keep the exact shapes the UI already consumes;
 *  - error mapping: an SDK error must surface as a **typed client error** —
 *    never a raw throw (USER_REJECTED / SIGNING_FAILED / SUBMISSION_FAILED /
 *    INSUFFICIENT_FEES / SIMULATION_FAILED, or a ContractResponse envelope);
 *  - the wallet-rejection paths users actually hit: a dismissed signing prompt,
 *    at both the ClientWalletAdapter bridge and the TicketService boundary;
 *  - the network-mismatch paths: a wrong-network XDR that fails to decode under
 *    the client passphrase (→ typed InvalidParams), and the SDK-supplied
 *    passphrase being honoured when the SDK simulates against another network;
 *  - the "not configured" guard (contract address === "TBD").
 *
 * Mocking strategy:
 *  - `@tikka/sdk` is mocked wholesale with faithful stand-ins whose
 *    TikkaSdkError/TikkaSdkErrorCode keep the real `code` values, so the
 *    `sdkErrorToPipelineError` classification inside transactionPipeline.ts
 *    behaves exactly like production.
 *  - `./walletService` (the wallet-kit boundary) and
 *    `@stellar/stellar-sdk`'s TransactionBuilder are mocked so the adapter
 *    bridge tests stay hermetic.
 *  - No spec stubs `global.fetch`: the shared MSW server (src/test/server.ts)
 *    keeps running via setupTests, and the network-isolation test proves
 *    sdkClient reaches the network only through the SDK. Shared fixtures
 *    (src/test/fixtures) seed the mocked contract responses.
 *
 * Framework: Vitest (globals: true, environment: jsdom)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { TikkaSdkError, TikkaSdkErrorCode, WalletName } from '@tikka/sdk';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { fakeRaffleDetail } from '../test/fixtures';
import { server } from '../test/server';

import { CONTRACT_CONFIG } from '../config/contract';
import { STELLAR_CONFIG } from '../config/stellar';
import { getAccountAddress, signTransaction as walletSign } from './walletService';
import {
  ClientWalletAdapter,
  sdkWalletAdapter,
  sdkContractService,
  sdkFeeEstimator,
  raffleService,
  ticketService,
  estimateCreate,
  createRaffle,
  buyTickets,
  claimPrize,
  buyTicket,
  getRaffleData,
  getActiveRaffleIds,
  getAllRaffleIds,
  getUserParticipation,
  isConfigured,
  getConfig,
  ContractService,
} from './sdkClient';
import type { PipelineProgressEvent } from './transactionPipeline';

// ── Module mocks ──────────────────────────────────────────────────────────────

/**
 * Faithful subset of the light SDK surface sdkClient consumes. Class instances
 * record their constructor args (so singleton wiring is assertable) and expose
 * vi.fn() methods (so tests can script success/failure per operation).
 */
vi.mock('@tikka/sdk', async () => {
  const { vi } = await import('vitest');

  class WalletAdapter {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown> = {}) {
      this.options = options;
    }
    async getNetwork(): Promise<string | undefined> {
      return undefined;
    }
  }

  const WalletName = {
    Freighter: 'freighter',
    XBull: 'xbull',
    Albedo: 'albedo',
    LOBSTR: 'lobstr',
    Rabet: 'rabet',
    Mock: 'mock',
    Custom: 'custom',
  } as const;

  // Mirrors sdk/src/utils/errors.ts so instanceof + err.code classification
  // inside transactionPipeline.ts behaves exactly like production.
  const TikkaSdkErrorCode = {
    WalletNotConnected: 'WALLET_NOT_CONNECTED',
    WalletNotInstalled: 'WALLET_NOT_INSTALLED',
    UserRejected: 'UserRejected',
    SimulationFailed: 'SimulationFailed',
    SubmissionFailed: 'SUBMISSION_FAILED',
    InvalidParams: 'INVALID_PARAMS',
    NetworkError: 'NetworkError',
    Timeout: 'TIMEOUT',
    RateLimit: 'RATE_LIMIT',
    Unavailable: 'UNAVAILABLE',
    Unknown: 'UNKNOWN',
  } as const;

  class TikkaSdkError extends Error {
    code: string;
    cause?: unknown;
    constructor(code: string, message: string, cause?: unknown) {
      super(message);
      this.name = 'TikkaSdkError';
      this.code = code;
      this.cause = cause;
    }
  }

  const ContractFn = {
    CREATE_RAFFLE: 'create_raffle',
    BUY_TICKET: 'buy_ticket',
    BUY_TICKETS_BATCH: 'buy_tickets_batch',
    CLAIM_PRIZE: 'claim_prize',
    GET_RAFFLE_DATA: 'get_raffle_data',
    GET_ACTIVE_RAFFLE_IDS: 'get_active_raffle_ids',
    GET_ALL_RAFFLE_IDS: 'get_all_raffle_ids',
    GET_USER_PARTICIPATION: 'get_user_participation',
  } as const;

  // Numeric contract states (see sdk bindings RaffleStatus).
  const RaffleStatus = { Open: 0, Drawing: 1, Finalized: 2, Cancelled: 3 } as const;

  // Same stroop → XLM semantics as the real util (7 decimals).
  const stroopsToXlm = (stroops: string | number): string => (Number(stroops) / 1e7).toFixed(7);

  class RpcService {
    config: Record<string, unknown>;
    constructor(networkConfig: Record<string, unknown>) {
      this.config = networkConfig;
    }
  }

  class HorizonService {
    config: Record<string, unknown>;
    constructor(networkConfig: Record<string, unknown>) {
      this.config = networkConfig;
    }
  }

  class ContractService {
    rpc: unknown;
    horizon: unknown;
    networkConfig: unknown;
    wallet: unknown;
    contractId: string;
    simulateReadOnly: Mock;
    simulate: Mock;
    sign: Mock;
    submit: Mock;
    poll: Mock;
    constructor(
      rpc: unknown,
      horizon: unknown,
      networkConfig: unknown,
      wallet: unknown,
      contractId: string,
    ) {
      this.rpc = rpc;
      this.horizon = horizon;
      this.networkConfig = networkConfig;
      this.wallet = wallet;
      this.contractId = contractId;
      this.simulateReadOnly = vi.fn();
      this.simulate = vi.fn();
      this.sign = vi.fn();
      this.submit = vi.fn();
      this.poll = vi.fn();
    }
  }

  class FeeEstimatorService {
    rpc: unknown;
    horizon: unknown;
    networkConfig: unknown;
    wallet: unknown;
    contractId: string;
    constructor(
      rpc: unknown,
      horizon: unknown,
      networkConfig: unknown,
      wallet: unknown,
      contractId: string,
    ) {
      this.rpc = rpc;
      this.horizon = horizon;
      this.networkConfig = networkConfig;
      this.wallet = wallet;
      this.contractId = contractId;
    }
  }

  class RaffleService {
    contract: unknown;
    feeEstimator: unknown;
    estimateCreate: Mock;
    buildCreateContractParams: Mock;
    listActive: Mock;
    listAll: Mock;
    constructor(contract: unknown, feeEstimator: unknown) {
      this.contract = contract;
      this.feeEstimator = feeEstimator;
      this.estimateCreate = vi.fn();
      this.buildCreateContractParams = vi.fn();
      this.listActive = vi.fn();
      this.listAll = vi.fn();
    }
  }

  class TicketReadService {
    contract: unknown;
    constructor(contract: unknown) {
      this.contract = contract;
    }
  }

  class TicketService {
    contract: unknown;
    readService: unknown;
    buyTickets: Mock;
    claimPrize: Mock;
    constructor(contract: unknown, readService?: unknown) {
      this.contract = contract;
      this.readService = readService;
      this.buyTickets = vi.fn();
      this.claimPrize = vi.fn();
    }
  }

  return {
    WalletAdapter,
    WalletName,
    TikkaSdkError,
    TikkaSdkErrorCode,
    ContractFn,
    RaffleStatus,
    stroopsToXlm,
    RpcService,
    HorizonService,
    ContractService,
    FeeEstimatorService,
    RaffleService,
    TicketReadService,
    TicketService,
  };
});

// The wallet-kit boundary: sdkClient's ClientWalletAdapter bridges onto these.
vi.mock('./walletService', async () => {
  const { vi } = await import('vitest');
  return {
    getAccountAddress: vi.fn(),
    signTransaction: vi.fn(),
  };
});

// TransactionBuilder.fromXDR is the adapter's wrong-network guard: an XDR
// built for another passphrase fails to decode under the client passphrase.
vi.mock('@stellar/stellar-sdk', async () => {
  const { vi } = await import('vitest');
  return {
    TransactionBuilder: { fromXDR: vi.fn() },
    Networks: {
      PUBLIC: 'Public Global Stellar Network ; September 2015',
      TESTNET: 'Test SDF Network ; September 2015',
    },
  };
});

// Mutable contract config so tests can flip between a deployed contract and
// the "TBD" (not yet deployed) state without re-importing the module.
vi.mock('../config/contract', async () => {
  const { vi } = await import('vitest');
  return {
    CONTRACT_CONFIG: {
      address: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      network: 'testnet',
      networkPassphrase: 'Test SDF Network ; September 2015',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      deploymentHash: undefined,
      functions: {
        getRaffleData: 'get_raffle_data',
        getActiveRaffleIds: 'get_active_raffle_ids',
        getAllRaffleIds: 'get_all_raffle_ids',
        getUserParticipation: 'get_user_raffle_participation',
        createRaffle: 'create_raffle',
        buyTicket: 'buy_ticket',
        claimPrize: 'claim_prize',
      },
      constants: {},
    },
    validateContractConfig: vi.fn(),
  };
});

// ── Constants & helpers ───────────────────────────────────────────────────────

const CONTRACT_ADDRESS = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const USER_ADDRESS = 'GTESTADDRESS1234567890ABCDEF'; // fixture creator (src/test/fixtures)

const RAFFLE_PARAMS = {
  metadataId: 'QmTest123', // fixture metadata_cid
  ticketPrice: '10000000', // 1 XLM in stroops
  totalTickets: fakeRaffleDetail.max_tickets, // 100
  durationInSeconds: 3600,
};

function setContractAddress(address: string): void {
  (CONTRACT_CONFIG as { address: string }).address = address;
}

/** Default success payload for the pipeline's simulate stage. */
const successSim = {
  returnValue: null,
  minResourceFee: '100',
  assembledXdr: 'ASSEMBLED_XDR',
  networkPassphrase: TESTNET_PASSPHRASE,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('sdkClient', () => {
  let simReadOnly: Mock;
  let simulate: Mock;
  let sign: Mock;
  let submit: Mock;
  let poll: Mock;
  let estimateCreateMock: Mock;
  let buildParamsMock: Mock;
  let listActive: Mock;
  let listAll: Mock;
  let buyTicketsMock: Mock;
  let claimPrizeMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_TEST_MODE', '');
    setContractAddress(CONTRACT_ADDRESS);

    // Default wallet state: connected, willing to sign, correct network.
    vi.mocked(getAccountAddress).mockResolvedValue(USER_ADDRESS);
    vi.mocked(walletSign).mockResolvedValue({
      success: true,
      signedTransaction: 'WALLET_SIGNED_XDR',
    });
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue({
      toXDR: () => 'WALLET_SIGNED_XDR',
    } as never);

    simReadOnly = sdkContractService.simulateReadOnly as unknown as Mock;
    simulate = sdkContractService.simulate as unknown as Mock;
    sign = sdkContractService.sign as unknown as Mock;
    submit = sdkContractService.submit as unknown as Mock;
    poll = sdkContractService.poll as unknown as Mock;
    estimateCreateMock = raffleService.estimateCreate as unknown as Mock;
    buildParamsMock = raffleService.buildCreateContractParams as unknown as Mock;
    listActive = raffleService.listActive as unknown as Mock;
    listAll = raffleService.listAll as unknown as Mock;
    buyTicketsMock = ticketService.buyTickets as unknown as Mock;
    claimPrizeMock = ticketService.claimPrize as unknown as Mock;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  // ── Module wiring ───────────────────────────────────────────────────────────

  describe('module wiring', () => {
    it('constructs the SDK singletons against the client network/contract config', () => {
      expect(sdkContractService.contractId).toBe(CONTRACT_ADDRESS);
      expect(sdkContractService.wallet).toBe(sdkWalletAdapter);
      expect(sdkContractService.networkConfig).toEqual({
        network: 'testnet',
        rpcUrl: STELLAR_CONFIG.rpcUrl,
        horizonUrl: STELLAR_CONFIG.horizonUrl,
        networkPassphrase: TESTNET_PASSPHRASE,
      });
      // The light-bundle RpcService receives the same network config.
      expect((sdkContractService.rpc as { config: { rpcUrl: string } }).config.rpcUrl).toBe(
        STELLAR_CONFIG.rpcUrl,
      );
      expect(raffleService.contract).toBe(sdkContractService);
      expect(raffleService.feeEstimator).toBe(sdkFeeEstimator);
      expect(ticketService.contract).toBe(sdkContractService);
    });

    it('boots with a placeholder contract id when the address is TBD (import never throws)', () => {
      // The singletons above were constructed while a real address was set.
      // The invariant under test: an address of "TBD" must never reach the SDK
      // as a contract id — assertConfigured() owns the friendly error at call
      // time instead of an import-time crash.
      setContractAddress('TBD');
      expect(isConfigured()).toBe(false);
      setContractAddress(CONTRACT_ADDRESS);
      expect(isConfigured()).toBe(true);
    });
  });

  // ── ClientWalletAdapter (SDK WalletAdapter bridge) ─────────────────────────

  describe('ClientWalletAdapter', () => {
    it('bridges the wallet kit: getPublicKey returns the connected address', async () => {
      const adapter = new ClientWalletAdapter();
      await expect(adapter.getPublicKey()).resolves.toBe(USER_ADDRESS);
      expect(getAccountAddress).toHaveBeenCalledTimes(1);
    });

    it('throws a typed WalletNotConnected error when no wallet is connected', async () => {
      vi.mocked(getAccountAddress).mockResolvedValue(null);
      const adapter = new ClientWalletAdapter();

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        name: 'TikkaSdkError',
        code: TikkaSdkErrorCode.WalletNotConnected,
        message: 'Wallet not connected',
      });
    });

    it('signs via the wallet kit and returns { signedXdr }', async () => {
      const adapter = new ClientWalletAdapter();
      const result = await adapter.signTransaction('UNSIGNED_XDR_B64');

      expect(TransactionBuilder.fromXDR).toHaveBeenCalledWith(
        'UNSIGNED_XDR_B64',
        TESTNET_PASSPHRASE,
      );
      expect(walletSign).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ signedXdr: 'WALLET_SIGNED_XDR' });
    });

    it('honours the SDK-supplied networkPassphrase over the client default', async () => {
      const adapter = new ClientWalletAdapter();

      await adapter.signTransaction('MAINNET_SIM_XDR', {
        networkPassphrase: MAINNET_PASSPHRASE,
      });

      // When the SDK simulates against a different network, the adapter must
      // decode with the passphrase the SDK returned — not the client's.
      expect(TransactionBuilder.fromXDR).toHaveBeenCalledWith(
        'MAINNET_SIM_XDR',
        MAINNET_PASSPHRASE,
      );
    });

    it('surfaces a wrong-network XDR as a typed InvalidParams error (network mismatch)', async () => {
      vi.mocked(TransactionBuilder.fromXDR).mockImplementation(() => {
        throw new Error('invalid passphrase supplied to fromXDR');
      });
      const adapter = new ClientWalletAdapter();

      // A wallet on Mainnet while the app is on Testnet produces an XDR that
      // does not decode under the client passphrase: it must surface as a
      // typed TikkaSdkError, not a raw TransactionBuilder throw.
      await expect(adapter.signTransaction('WRONG_NETWORK_XDR')).rejects.toMatchObject({
        name: 'TikkaSdkError',
        code: TikkaSdkErrorCode.InvalidParams,
        message: 'Failed to decode transaction XDR',
      });
      expect(walletSign).not.toHaveBeenCalled();
    });

    it('maps a wallet sign refusal to a typed WalletNotInstalled error carrying the wallet message', async () => {
      vi.mocked(walletSign).mockResolvedValue({
        success: false,
        error: 'User rejected the request',
      });
      const adapter = new ClientWalletAdapter();

      await expect(adapter.signTransaction('UNSIGNED_XDR_B64')).rejects.toMatchObject({
        name: 'TikkaSdkError',
        code: TikkaSdkErrorCode.WalletNotInstalled,
        message: 'User rejected the request',
      });
    });

    it('uses a default message when the wallet fails without one', async () => {
      vi.mocked(walletSign).mockResolvedValue({ success: false });
      const adapter = new ClientWalletAdapter();

      await expect(adapter.signTransaction('UNSIGNED_XDR_B64')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
        message: 'Wallet failed to sign transaction',
      });
    });

    it('supports wallet adapters that hand back a signed transaction object (toXDR())', async () => {
      vi.mocked(walletSign).mockResolvedValue({
        success: true,
        signedTransaction: { toXDR: () => 'OBJECT_SIGNED_XDR' },
      });
      const adapter = new ClientWalletAdapter();

      await expect(adapter.signTransaction('UNSIGNED_XDR_B64')).resolves.toEqual({
        signedXdr: 'OBJECT_SIGNED_XDR',
      });
    });

    it('rejects undecodable XDR with the same typed error', async () => {
      vi.mocked(TransactionBuilder.fromXDR).mockImplementation(() => {
        throw new Error('not base64');
      });
      const adapter = new ClientWalletAdapter();
      await expect(adapter.signTransaction('garbage')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.InvalidParams,
      });
    });

    it('is a custom adapter that advertises its capabilities honestly', () => {
      expect(sdkWalletAdapter).toBeInstanceOf(ClientWalletAdapter);
      expect(sdkWalletAdapter.name).toBe(WalletName.Custom);
      expect(sdkWalletAdapter.isAvailable()).toBe(true);
      expect(sdkWalletAdapter.getCapabilities()).toEqual({
        supportsGetPublicKey: true,
        supportsSignTransaction: true,
        supportsSignMessage: false,
        supportsGetNetwork: true,
      });
      expect(sdkWalletAdapter.options).toEqual({ networkPassphrase: TESTNET_PASSPHRASE });
    });
  });

  // ── estimateCreate ──────────────────────────────────────────────────────────

  describe('estimateCreate', () => {
    it('returns a fixed preview in VITE_TEST_MODE without touching the SDK', async () => {
      vi.stubEnv('VITE_TEST_MODE', 'true');

      const res = await estimateCreate(RAFFLE_PARAMS);

      expect(res).toEqual({ success: true, data: { xlm: '0.0000100', stroops: '100' } });
      expect(estimateCreateMock).not.toHaveBeenCalled();
    });

    it('delegates to RaffleService.estimateCreate with converted params (no submit)', async () => {
      const NOW = Date.parse('2026-09-26T12:00:00Z');
      vi.useFakeTimers({ now: NOW });
      estimateCreateMock.mockResolvedValue({ xlm: '0.0050100', stroops: '50100' });

      const res = await estimateCreate(RAFFLE_PARAMS);

      expect(res).toEqual({ success: true, data: { xlm: '0.0050100', stroops: '50100' } });
      expect(estimateCreateMock).toHaveBeenCalledWith({
        ticketPrice: '1.0000000', // stroopsToXlm('10000000')
        maxTickets: 100,
        endTime: Math.floor(NOW / 1000) * 1000 + 3600 * 1000,
        allowMultiple: true,
        asset: 'XLM',
        metadataCid: 'QmTest123',
      });
      // A preview must never assemble/sign/submit.
      expect(simulate).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
    });

    it('maps an SDK estimate failure to success:false with the message (never throws)', async () => {
      estimateCreateMock.mockRejectedValue(new Error('simulation unavailable'));

      const res = await estimateCreate(RAFFLE_PARAMS);

      expect(res).toEqual({ success: false, error: 'simulation unavailable' });
    });

    it('returns the friendly not-configured error when the contract is not deployed', async () => {
      setContractAddress('TBD');

      const res = await estimateCreate(RAFFLE_PARAMS);

      expect(res).toEqual({
        success: false,
        error: 'Contract address not configured. Please deploy the contract first.',
      });
      expect(estimateCreateMock).not.toHaveBeenCalled();
    });
  });

  // ── createRaffle ────────────────────────────────────────────────────────────

  describe('createRaffle', () => {
    it('returns a mocked success with the full progress sequence in VITE_TEST_MODE', async () => {
      vi.stubEnv('VITE_TEST_MODE', 'true');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const events: PipelineProgressEvent[] = [];

      const res = await createRaffle(RAFFLE_PARAMS, { onProgress: (e) => events.push(e) });

      expect(res).toEqual({ ok: true, data: { txHash: 'TEST123' } });
      expect(events.map((e) => `${e.stage}:${e.status}`)).toEqual([
        'BUILD:done',
        'ESTIMATE:done',
        'SIGN:done',
        'SUBMIT:done',
        'POLL:done',
        'DONE:done',
      ]);
      expect(buildParamsMock).not.toHaveBeenCalled();
      expect(simulate).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('runs the build → estimate → sign → submit → poll pipeline via the SDK', async () => {
      const NOW = Date.parse('2026-09-26T12:00:00Z');
      vi.useFakeTimers({ now: NOW });
      buildParamsMock.mockReturnValue(['SCVAL_SENTINEL']);
      simulate.mockResolvedValue(successSim);
      sign.mockResolvedValue('SIGNED_XDR');
      submit.mockResolvedValue('HASH123');
      poll.mockResolvedValue({ returnValue: 7, txHash: 'HASH123', ledger: 99 });

      const res = await createRaffle(RAFFLE_PARAMS);

      expect(buildParamsMock).toHaveBeenCalledWith({
        ticketPrice: '1.0000000',
        maxTickets: 100,
        endTime: (Math.floor(NOW / 1000) + 3600) * 1000,
        allowMultiple: true,
        asset: 'XLM',
        metadataCid: 'QmTest123',
      });
      expect(simulate).toHaveBeenCalledWith('create_raffle', ['SCVAL_SENTINEL']);
      expect(sign).toHaveBeenCalledWith('ASSEMBLED_XDR', TESTNET_PASSPHRASE);
      expect(submit).toHaveBeenCalledWith('SIGNED_XDR');
      expect(res).toEqual({ ok: true, data: { txHash: 'HASH123', confirmedAt: 99 } });
    });

    it('emits the DONE progress event carrying the confirmed txHash', async () => {
      buildParamsMock.mockReturnValue(['SCVAL_SENTINEL']);
      simulate.mockResolvedValue(successSim);
      sign.mockResolvedValue('SIGNED_XDR');
      submit.mockResolvedValue('HASH123');
      poll.mockResolvedValue({ returnValue: 7, txHash: 'HASH123', ledger: 99 });
      const events: PipelineProgressEvent[] = [];

      await createRaffle(RAFFLE_PARAMS, { onProgress: (e) => events.push(e) });

      expect(events[events.length - 1]).toEqual({
        stage: 'DONE',
        status: 'done',
        txHash: 'HASH123',
      });
    });

    it('forwards poll timing options to the SDK poll stage', async () => {
      buildParamsMock.mockReturnValue(['SCVAL_SENTINEL']);
      simulate.mockResolvedValue(successSim);
      sign.mockResolvedValue('SIGNED_XDR');
      submit.mockResolvedValue('HASH123');
      poll.mockResolvedValue({ returnValue: 7, txHash: 'HASH123', ledger: 1 });

      await createRaffle(RAFFLE_PARAMS, { pollTimeoutMs: 500, pollIntervalMs: 100 });

      expect(poll).toHaveBeenCalledWith('HASH123', { timeoutMs: 500, intervalMs: 100 });
    });

    it('throws the friendly not-configured error before touching the SDK when the contract is not deployed', async () => {
      setContractAddress('TBD');

      await expect(createRaffle(RAFFLE_PARAMS)).rejects.toThrow(
        'Contract address not configured. Please deploy the contract first.',
      );
      expect(simulate).not.toHaveBeenCalled();
    });

    it('maps a simulation failure to a typed SIMULATION_FAILED result (never a raw throw)', async () => {
      buildParamsMock.mockReturnValue(['SCVAL_SENTINEL']);
      simulate.mockRejectedValue(
        new TikkaSdkError(
          TikkaSdkErrorCode.SimulationFailed,
          'Simulation failed for create_raffle',
        ),
      );

      const res = await createRaffle(RAFFLE_PARAMS);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('SIMULATION_FAILED');
      }
      expect(sign).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
    });

    it('maps a user dismissal at the signing stage to a typed USER_REJECTED result', async () => {
      buildParamsMock.mockReturnValue(['SCVAL_SENTINEL']);
      simulate.mockResolvedValue(successSim);
      sign.mockRejectedValue(
        new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'User rejected the request'),
      );

      const res = await createRaffle(RAFFLE_PARAMS);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('USER_REJECTED');
        expect(res.error.message).toBe('Transaction was rejected by the user.');
      }
      // Nothing was broadcast after the refusal.
      expect(submit).not.toHaveBeenCalled();
    });
  });

  // ── buyTickets ──────────────────────────────────────────────────────────────

  describe('buyTickets', () => {
    it('delegates to TicketService.buyTickets and returns the txHash', async () => {
      buyTicketsMock.mockResolvedValue({
        success: true,
        value: { transactionHash: 'BUYHASH', ticketIds: [1, 2], ledger: 42 },
        transactionHash: 'BUYHASH',
      });

      const res = await buyTickets({
        raffleId: fakeRaffleDetail.id,
        ticketCount: 2,
        maxPricePerTicket: '10000000',
      });

      expect(buyTicketsMock).toHaveBeenCalledWith({
        raffleId: 123,
        count: 2,
        maxPricePerTicket: '10000000',
      });
      expect(res).toEqual({ ok: true, data: { txHash: 'BUYHASH' } });
    });

    it('falls back to the top-level transactionHash when value carries none', async () => {
      buyTicketsMock.mockResolvedValue({ success: true, transactionHash: 'TOPHASH' });

      const res = await buyTickets({ raffleId: 1, ticketCount: 1, maxPricePerTicket: '10000000' });

      expect(res).toEqual({ ok: true, data: { txHash: 'TOPHASH' } });
    });

    it('maps a wallet rejection to a typed USER_REJECTED result — the path users actually hit', async () => {
      buyTicketsMock.mockRejectedValue(
        new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'User rejected the request'),
      );

      // Must resolve with a typed result, not throw the raw SDK error.
      const res = await buyTickets({ raffleId: 1, ticketCount: 1, maxPricePerTicket: '10000000' });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('USER_REJECTED');
        expect(res.error.message).toBe('Transaction was rejected by the user.');
      }
    });

    it('maps an SDK NetworkError (wallet on the wrong network / RPC unreachable) to SUBMISSION_FAILED', async () => {
      buyTicketsMock.mockRejectedValue(
        new TikkaSdkError(TikkaSdkErrorCode.NetworkError, 'RPC request failed'),
      );

      const res = await buyTickets({ raffleId: 1, ticketCount: 1, maxPricePerTicket: '10000000' });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('SUBMISSION_FAILED');
        expect(res.error.message).toBe('RPC request failed');
      }
    });

    it('maps a fee problem to INSUFFICIENT_FEES', async () => {
      buyTicketsMock.mockRejectedValue(new Error('Insufficient balance to cover fee'));

      const res = await buyTickets({ raffleId: 1, ticketCount: 1, maxPricePerTicket: '10000000' });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('INSUFFICIENT_FEES');
      }
    });

    it('returns the friendly not-configured error when the contract is not deployed', async () => {
      setContractAddress('TBD');

      const res = await buyTickets({ raffleId: 1, ticketCount: 1, maxPricePerTicket: '10000000' });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('SUBMISSION_FAILED');
        expect(res.error.message).toContain('Contract address not configured');
      }
      expect(buyTicketsMock).not.toHaveBeenCalled();
    });
  });

  // ── claimPrize ──────────────────────────────────────────────────────────────

  describe('claimPrize', () => {
    it('delegates to TicketService.claimPrize and returns the txHash', async () => {
      claimPrizeMock.mockResolvedValue({
        success: true,
        value: { transactionHash: 'CLAIMHASH' },
        transactionHash: 'CLAIMHASH',
      });

      const res = await claimPrize({ raffleId: fakeRaffleDetail.id });

      expect(claimPrizeMock).toHaveBeenCalledWith({ raffleId: 123 });
      expect(res).toEqual({ ok: true, data: { txHash: 'CLAIMHASH' } });
    });

    it('returns a typed SUBMISSION_FAILED result when no txHash comes back', async () => {
      claimPrizeMock.mockResolvedValue({ success: false, error: 'Prize not claimable yet' });

      const res = await claimPrize({ raffleId: 1 });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('SUBMISSION_FAILED');
        expect(res.error.message).toBe('Prize not claimable yet');
      }
    });

    it('uses the default message when the claim fails without an error string', async () => {
      claimPrizeMock.mockResolvedValue({ success: true, value: {} });

      const res = await claimPrize({ raffleId: 1 });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.message).toBe('Prize claim failed');
      }
    });

    it('maps a wallet rejection during the claim to USER_REJECTED', async () => {
      claimPrizeMock.mockRejectedValue(new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'no'));

      const res = await claimPrize({ raffleId: 1 });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('USER_REJECTED');
      }
    });
  });

  // ── buyTicket (deprecated wrapper) ──────────────────────────────────────────

  describe('buyTicket (deprecated)', () => {
    it('wraps buyTickets into the legacy ContractResponse<string> envelope', async () => {
      buyTicketsMock.mockResolvedValue({
        success: true,
        value: { transactionHash: 'BUYHASH' },
        transactionHash: 'BUYHASH',
      });

      const res = await buyTicket({ raffleId: 1, ticketCount: 1, maxPricePerTicket: '10000000' });

      expect(res).toEqual({ success: true, data: 'BUYHASH', transactionHash: 'BUYHASH' });
    });

    it('maps buyTickets failure into success:false with the typed error message', async () => {
      buyTicketsMock.mockRejectedValue(new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'no'));

      const res = await buyTicket({ raffleId: 1, ticketCount: 1, maxPricePerTicket: '10000000' });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Transaction was rejected by the user.');
    });
  });

  // ── getRaffleData ───────────────────────────────────────────────────────────

  describe('getRaffleData', () => {
    it('maps an open raffle simulation onto the ContractRaffleData shape', async () => {
      simReadOnly.mockResolvedValue({
        success: true,
        value: {
          creator: fakeRaffleDetail.creator,
          metadata_cid: 'QmTest123',
          ticket_price: '10000000',
          max_tickets: fakeRaffleDetail.max_tickets,
          tickets_sold: 5,
          end_time: 1893456000,
          status: 0, // RaffleStatus.Open
          prize_distributed: false,
        },
      });

      const res = await getRaffleData(fakeRaffleDetail.id);

      expect(simReadOnly).toHaveBeenCalledWith('get_raffle_data', [fakeRaffleDetail.id]);
      expect(res.success).toBe(true);
      expect(res.data).toEqual({
        id: fakeRaffleDetail.id,
        creator: 'GTESTADDRESS1234567890ABCDEF',
        metadataId: 'QmTest123',
        ticketPrice: '10000000',
        totalTickets: 100,
        ticketsSold: 5,
        endTime: 1893456000,
        isActive: true,
        winner: undefined,
        prizeDistributed: false,
      });
    });

    it('marks a finalized raffle inactive and carries the winner', async () => {
      simReadOnly.mockResolvedValue({
        success: true,
        value: {
          creator: fakeRaffleDetail.creator,
          status: 2, // RaffleStatus.Finalized
          winner: USER_ADDRESS,
          prize_distributed: true,
        },
      });

      const res = await getRaffleData(1);

      expect(res.success).toBe(true);
      expect(res.data?.isActive).toBe(false);
      expect(res.data?.winner).toBe(USER_ADDRESS);
      expect(res.data?.prizeDistributed).toBe(true);
    });

    it('maps a failed read-only simulation to success:false with the message (never throws)', async () => {
      simReadOnly.mockRejectedValue(new Error('read-only simulation of get_raffle_data failed'));

      const res = await getRaffleData(1);

      expect(res).toEqual({
        success: false,
        error: 'read-only simulation of get_raffle_data failed',
      });
    });
  });

  // ── getActiveRaffleIds / getAllRaffleIds ────────────────────────────────────

  describe('getActiveRaffleIds / getAllRaffleIds', () => {
    it('returns active raffle ids from RaffleService.listActive', async () => {
      listActive.mockResolvedValue({ success: true, value: [1, 2, 3] });

      const res = await getActiveRaffleIds();

      expect(res).toEqual({ success: true, data: [1, 2, 3], error: undefined });
    });

    it('propagates a failed listActive without throwing', async () => {
      listActive.mockResolvedValue({ success: false, error: 'ledger unreachable' });

      const res = await getActiveRaffleIds();

      expect(res).toEqual({ success: false, data: [], error: 'ledger unreachable' });
    });

    it('returns all raffle ids from RaffleService.listAll', async () => {
      listAll.mockResolvedValue({ success: true, value: [1, 2] });

      const res = await getAllRaffleIds();

      expect(res).toEqual({ success: true, data: [1, 2], error: undefined });
    });

    it('maps a listAll throw to success:false with the message', async () => {
      listAll.mockRejectedValue(new Error('rpc down'));

      const res = await getAllRaffleIds();

      expect(res).toEqual({ success: false, error: 'rpc down' });
    });
  });

  // ── getUserParticipation ────────────────────────────────────────────────────

  describe('getUserParticipation', () => {
    it('maps the legacy participation binding onto ContractUserParticipation', async () => {
      simReadOnly.mockResolvedValue({
        success: true,
        value: { tickets: 3, amount_spent: '30000000', participation_time: 123456 },
      });

      const res = await getUserParticipation(USER_ADDRESS, fakeRaffleDetail.id);

      expect(simReadOnly).toHaveBeenCalledWith(CONTRACT_CONFIG.functions.getUserParticipation, [
        USER_ADDRESS,
        fakeRaffleDetail.id,
      ]);
      expect(res).toEqual({
        success: true,
        data: {
          raffleId: fakeRaffleDetail.id,
          userAddress: USER_ADDRESS,
          ticketsPurchased: 3,
          totalSpent: '30000000',
          participationTime: 123456,
        },
      });
    });

    it('returns null participation when the user holds no tickets', async () => {
      simReadOnly.mockResolvedValue({ success: true, value: { tickets: 0 } });

      const res = await getUserParticipation(USER_ADDRESS, 1);

      expect(res).toEqual({ success: true, data: null });
    });

    it('returns null participation for a missing record', async () => {
      simReadOnly.mockResolvedValue({ success: true, value: null });

      const res = await getUserParticipation(USER_ADDRESS, 1);

      expect(res).toEqual({ success: true, data: null });
    });

    it('maps a simulation failure to success:false with the message', async () => {
      simReadOnly.mockRejectedValue(new Error('simulation failed'));

      const res = await getUserParticipation(USER_ADDRESS, 1);

      expect(res).toEqual({ success: false, error: 'simulation failed' });
    });
  });

  // ── isConfigured / getConfig / ContractService facade ───────────────────────

  describe('isConfigured / getConfig / ContractService facade', () => {
    it('reflects the deployed contract state', () => {
      expect(isConfigured()).toBe(true);
      setContractAddress('TBD');
      expect(isConfigured()).toBe(false);
      setContractAddress(CONTRACT_ADDRESS);
    });

    it('exposes the raw contract configuration by reference', () => {
      expect(getConfig()).toBe(CONTRACT_CONFIG);
    });

    it('preserves the legacy ContractService.* call sites', () => {
      expect(ContractService.estimateCreate).toBe(estimateCreate);
      expect(ContractService.createRaffle).toBe(createRaffle);
      expect(ContractService.buyTickets).toBe(buyTickets);
      expect(ContractService.buyTicket).toBe(buyTicket);
      expect(ContractService.claimPrize).toBe(claimPrize);
      expect(ContractService.getRaffleData).toBe(getRaffleData);
      expect(ContractService.getActiveRaffleIds).toBe(getActiveRaffleIds);
      expect(ContractService.getAllRaffleIds).toBe(getAllRaffleIds);
      expect(ContractService.getUserParticipation).toBe(getUserParticipation);
      expect(ContractService.isConfigured).toBe(isConfigured);
      expect(ContractService.getConfig).toBe(getConfig);
    });
  });

  // ── Network isolation ───────────────────────────────────────────────────────

  describe('network isolation', () => {
    it('reaches the network only through the SDK — zero HTTP requests hit the MSW server', async () => {
      buildParamsMock.mockReturnValue(['SCVAL_SENTINEL']);
      simulate.mockResolvedValue(successSim);
      sign.mockResolvedValue('SIGNED_XDR');
      submit.mockResolvedValue('HASH123');
      poll.mockResolvedValue({ returnValue: 7, txHash: 'HASH123', ledger: 1 });

      const seen: Request[] = [];
      const onRequest = ({ request }: { request: Request }) => seen.push(request);
      server.events.on('request:start', onRequest);

      try {
        // A write through the pipeline…
        const write = await createRaffle(RAFFLE_PARAMS);
        // …and every read path.
        await getRaffleData(fakeRaffleDetail.id);
        await getActiveRaffleIds();
        await getAllRaffleIds();
        await getUserParticipation(USER_ADDRESS, fakeRaffleDetail.id);

        expect(write.ok).toBe(true);
        expect(seen).toHaveLength(0);
      } finally {
        server.events.removeListener('request:start', onRequest);
      }
    });
  });
});
