import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TxSubmitterService, TransactionOutcome, TransactionState } from './tx-submitter.service';
import { FeeEstimatorService } from './fee-estimator.service';
import { CostEstimatorService } from './cost-estimator.service';
import { KeyService } from '../keys/key.service';
import { OracleLoggerService } from '../logger/oracle-logger';

describe('TxSubmitterService', () => {
  let service: TxSubmitterService;
  let mockRpcServer: any;
  let mockKeyService: jest.Mocked<KeyService>;
  let mockFeeEstimator: jest.Mocked<FeeEstimatorService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    // Mock RPC server
    mockRpcServer = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
      getAccount: jest.fn().mockResolvedValue({
        accountId: () => 'GTEST',
        sequenceNumber: () => '100',
        incrementSequenceNumber: jest.fn(),
      }),
      prepareTransaction: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
      simulateTransaction: jest.fn().mockResolvedValue({ error: null }),
      sendTransaction: jest.fn(),
      getTransaction: jest.fn(),
    };

    mockKeyService = {
      getPublicKey: jest.fn().mockResolvedValue('GTEST'),
      signTransaction: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockFeeEstimator = {
      estimateFee: jest.fn().mockResolvedValue({
        cappedFee: 1000,
        priorityFee: 1000,
        isCapped: false,
      }),
    } as any;

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          SOROBAN_RPC_URL: 'https://test-rpc.stellar.org',
          RAFFLE_CONTRACT_ID: 'CTEST',
          NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
          TX_SUBMIT_MAX_ATTEMPTS: 3,
          TX_SUBMIT_INITIAL_BACKOFF_MS: 100,
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TxSubmitterService,
        { provide: OracleLoggerService, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FeeEstimatorService, useValue: mockFeeEstimator },
        { provide: KeyService, useValue: mockKeyService },
        {
          provide: CostEstimatorService,
          useValue: {
            recordRevealCost: jest.fn(),
            recordSubmissionRetry: jest.fn(),
            recordSubmissionFailure: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TxSubmitterService>(TxSubmitterService);

    // Inject mock RPC server
    (service as any).rpcServer = mockRpcServer;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Test 1: Clean Success', () => {
    it('should successfully submit transaction on first try', async () => {
      const txHash = 'abc123def456';
      const ledger = 12345;

      mockRpcServer.sendTransaction.mockResolvedValue({
        hash: txHash,
        status: 'PENDING',
      });

      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger,
      });

      const randomness = { seed: 'seed123', proof: 'proof456' };
      const outcome = await service.submitRandomnessTyped(100, 'req-1', randomness);

      expect(outcome.status).toBe('SUCCESS');
      if (outcome.status === 'SUCCESS') {
        expect(outcome.txHash).toBe(txHash);
        expect(outcome.ledger).toBe(ledger);
      }
      expect(outcome.retriable).toBe(false);
      expect(mockRpcServer.sendTransaction).toHaveBeenCalledTimes(1);
      expect(mockRpcServer.getTransaction).toHaveBeenCalled();
    });

    it('should include fee paid in success outcome', async () => {
      const txHash = 'fee123';
      const ledger = 12346;

      mockRpcServer.sendTransaction.mockResolvedValue({ hash: txHash });
      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger,
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(101, 'req-2', randomness);

      expect(outcome.status).toBe('SUCCESS');
      if (outcome.status === 'SUCCESS') {
        expect(outcome.feePaid).toBeDefined();
      }
    });
  });

  describe('Test 2: Timeout & Polling Recovery', () => {
    it('should recover from initial timeout by polling transaction hash', async () => {
      const txHash = 'timeout123';
      const ledger = 12347;

      // First call times out, but returns hash
      mockRpcServer.sendTransaction.mockResolvedValue({
        hash: txHash,
        status: 'PENDING',
      });

      // Polling eventually succeeds
      mockRpcServer.getTransaction
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'SUCCESS', ledger });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(102, 'req-3', randomness);

      expect(outcome.status).toBe('SUCCESS');
      if (outcome.status === 'SUCCESS') {
        expect(outcome.txHash).toBe(txHash);
        expect(outcome.ledger).toBe(ledger);
      }
      expect(mockRpcServer.getTransaction).toHaveBeenCalledWith(txHash);
      expect(mockRpcServer.getTransaction).toHaveBeenCalledTimes(3);
    });

    it('should return TIMEOUT when polling exhausts without confirmation', async () => {
      const txHash = 'never-confirms';

      mockRpcServer.sendTransaction.mockResolvedValue({ hash: txHash });

      // Always return NOT_FOUND
      mockRpcServer.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(103, 'req-4', randomness);

      expect(outcome.status).toBe('TIMEOUT');
      expect(outcome.retriable).toBe(true);
      if (outcome.status === 'TIMEOUT') {
        expect(outcome.txHash).toBe(txHash);
        expect(outcome.pollAttempts).toBeGreaterThan(0);
      }
    });

    it('should handle 504 timeout error during submission', async () => {
      mockRpcServer.sendTransaction.mockRejectedValue(
        new Error('Request timeout: 504 Gateway Timeout'),
      );

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(104, 'req-5', randomness);

      expect(outcome.status).toBe('TIMEOUT');
      expect(outcome.retriable).toBe(true);
    });
  });

  describe('Test 3: Duplicate Submission', () => {
    it('should detect duplicate and query existing transaction', async () => {
      const txHash = 'duplicate123';
      const ledger = 12348;

      mockRpcServer.sendTransaction.mockResolvedValue({
        hash: txHash,
        error: 'tx_duplicate',
        status: 'DUPLICATE',
      });

      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger,
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(105, 'req-6', randomness);

      expect(outcome.status).toBe('DUPLICATE_SUCCESS');
      expect(outcome.retriable).toBe(false);
      if (outcome.status === 'DUPLICATE_SUCCESS') {
        expect(outcome.txHash).toBe(txHash);
        expect(outcome.ledger).toBe(ledger);
        expect(outcome.message).toContain('already submitted');
      }
    });

    it('should handle duplicate error in exception', async () => {
      const txHash = 'dup-exception';

      const duplicateError = new Error('Transaction already exists: duplicate');
      (duplicateError as any).hash = txHash;

      mockRpcServer.sendTransaction.mockRejectedValue(duplicateError);
      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12349,
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(106, 'req-7', randomness);

      expect(outcome.status).toBe('DUPLICATE_SUCCESS');
      expect(outcome.retriable).toBe(false);
    });

    it('should treat duplicate as success even if query fails', async () => {
      mockRpcServer.sendTransaction.mockResolvedValue({
        hash: 'dup-unknown',
        error: 'already submitted',
      });

      mockRpcServer.getTransaction.mockRejectedValue(new Error('Not found'));

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(107, 'req-8', randomness);

      expect(outcome.status).toBe('DUPLICATE_SUCCESS');
      expect(outcome.retriable).toBe(false);
    });
  });

  describe('Test 4: Insufficient Fee', () => {
    it('should detect insufficient fee and mark as retriable', async () => {
      mockRpcServer.sendTransaction.mockResolvedValue({
        error: 'tx_insufficient_fee',
        status: 'ERROR',
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(108, 'req-9', randomness);

      expect(outcome.status).toBe('INSUFFICIENT_FEE');
      expect(outcome.retriable).toBe(true);
      if (outcome.status === 'INSUFFICIENT_FEE') {
        expect(outcome.error).toContain('insufficient');
      }
    });

    it('should retry with fee bump on insufficient fee', async () => {
      let callCount = 0;

      mockRpcServer.sendTransaction.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ error: 'tx_insufficient_fee' });
        }
        return Promise.resolve({ hash: 'fee-bumped-tx' });
      });

      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12350,
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(109, 'req-10', randomness);

      expect(outcome.status).toBe('SUCCESS');
      expect(mockRpcServer.sendTransaction).toHaveBeenCalledTimes(2);
    });

    it('should handle insufficient fee in transaction result', async () => {
      const txHash = 'low-fee-tx';

      mockRpcServer.sendTransaction.mockResolvedValue({ hash: txHash });
      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'FAILED',
        error: 'insufficient fee',
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(110, 'req-11', randomness);

      expect(outcome.status).toBe('FAILED');
      expect(outcome.retriable).toBe(false);
    });
  });

  describe('Test 5: Network / Transport Failure', () => {
    it('should detect network error and mark as retriable', async () => {
      mockRpcServer.sendTransaction.mockRejectedValue(
        new Error('ECONNREFUSED: Connection refused'),
      );

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(111, 'req-12', randomness);

      expect(outcome.status).toBe('NETWORK_ERROR');
      expect(outcome.retriable).toBe(true);
      if (outcome.status === 'NETWORK_ERROR') {
        expect(outcome.error).toContain('ECONNREFUSED');
      }
    });

    it('should handle 503 service unavailable', async () => {
      mockRpcServer.sendTransaction.mockRejectedValue(
        new Error('HTTP 503: Service Unavailable'),
      );

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(112, 'req-13', randomness);

      expect(outcome.status).toBe('NETWORK_ERROR');
      expect(outcome.retriable).toBe(true);
    });

    it('should handle 502 bad gateway', async () => {
      mockRpcServer.sendTransaction.mockRejectedValue(new Error('502 Bad Gateway'));

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(113, 'req-14', randomness);

      expect(outcome.status).toBe('NETWORK_ERROR');
      expect(outcome.retriable).toBe(true);
    });

    it('should retry on network error with backoff', async () => {
      let callCount = 0;

      mockRpcServer.sendTransaction.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('ECONNREFUSED'));
        }
        return Promise.resolve({ hash: 'recovered-tx' });
      });

      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12351,
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(114, 'req-15', randomness);

      expect(outcome.status).toBe('SUCCESS');
      expect(mockRpcServer.sendTransaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('Invalid Transaction Errors', () => {
    it('should detect invalid transaction and mark as non-retriable', async () => {
      mockRpcServer.sendTransaction.mockRejectedValue(
        new Error('Invalid transaction: malformed XDR'),
      );

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(115, 'req-16', randomness);

      expect(outcome.status).toBe('INVALID_TRANSACTION');
      expect(outcome.retriable).toBe(false);
    });

    it('should handle unauthorized error', async () => {
      mockRpcServer.sendTransaction.mockRejectedValue(new Error('Unauthorized: invalid signature'));

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(116, 'req-17', randomness);

      expect(outcome.status).toBe('INVALID_TRANSACTION');
      expect(outcome.retriable).toBe(false);
    });

    it('should handle missing contract ID', async () => {
      (service as any).contractId = '';

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(117, 'req-18', randomness);

      expect(outcome.status).toBe('INVALID_TRANSACTION');
      expect(outcome.retriable).toBe(false);
      if (outcome.status === 'INVALID_TRANSACTION') {
        expect(outcome.error).toContain('RAFFLE_CONTRACT_ID');
      }
    });
  });

  describe('Transaction Failed Status', () => {
    it('should handle FAILED status from network', async () => {
      const txHash = 'failed-tx';

      mockRpcServer.sendTransaction.mockResolvedValue({ hash: txHash });
      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'FAILED',
        resultXdr: 'failed_xdr_data',
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(118, 'req-19', randomness);

      expect(outcome.status).toBe('FAILED');
      expect(outcome.retriable).toBe(false);
      if (outcome.status === 'FAILED') {
        expect(outcome.txHash).toBe(txHash);
        expect(outcome.failureReason).toBeDefined();
      }
    });
  });

  describe('Telemetry and Logging', () => {
    it('should log structured telemetry with all required fields', async () => {
      const logSpy = jest.spyOn((service as any).logger, 'log');

      mockRpcServer.sendTransaction.mockResolvedValue({ hash: 'telemetry-tx' });
      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12352,
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      await service.submitRandomnessTyped(119, 'req-20', randomness);

      expect(logSpy).toHaveBeenCalled();

      const logCalls = logSpy.mock.calls;
      const finalLog = logCalls[logCalls.length - 1][0];
      const logEntry = JSON.parse(finalLog as string);

      expect(logEntry).toHaveProperty('txHash');
      expect(logEntry).toHaveProperty('raffleId', 119);
      expect(logEntry).toHaveProperty('requestId', 'req-20');
      expect(logEntry).toHaveProperty('finalOutcome');
      expect(logEntry).toHaveProperty('timestamp');
    });

    it('should log errors with error level', async () => {
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      mockRpcServer.sendTransaction.mockRejectedValue(new Error('Fatal error'));

      const randomness = { seed: 'seed', proof: 'proof' };
      await service.submitRandomnessTyped(120, 'req-21', randomness);

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should log warnings for retriable errors', async () => {
      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      mockRpcServer.sendTransaction.mockResolvedValue({ hash: 'warn-tx' });
      mockRpcServer.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });

      const randomness = { seed: 'seed', proof: 'proof' };
      await service.submitRandomnessTyped(121, 'req-22', randomness);

      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('Legacy Compatibility', () => {
    it('should convert SUCCESS outcome to legacy format', async () => {
      mockRpcServer.sendTransaction.mockResolvedValue({ hash: 'legacy-tx' });
      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12353,
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const result = await service.submitRandomness(122, randomness);

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('legacy-tx');
      expect(result.ledger).toBe(12353);
    });

    it('should convert DUPLICATE_SUCCESS to legacy success', async () => {
      mockRpcServer.sendTransaction.mockResolvedValue({
        hash: 'dup-legacy',
        error: 'duplicate',
      });
      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12354,
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const result = await service.submitRandomness(123, randomness);

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('dup-legacy');
    });

    it('should convert failure outcomes to legacy failure', async () => {
      mockRpcServer.sendTransaction.mockRejectedValue(new Error('Failed'));

      const randomness = { seed: 'seed', proof: 'proof' };
      const result = await service.submitRandomness(124, randomness);

      expect(result.success).toBe(false);
      expect(result.txHash).toBe('');
      expect(result.ledger).toBe(0);
    });
  });

  describe('Max Attempts Exhaustion', () => {
    it('should return FAILED after exhausting max attempts', async () => {
      mockRpcServer.sendTransaction.mockRejectedValue(new Error('Temporary error'));

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(125, 'req-23', randomness);

      expect(outcome.status).toBe('FAILED');
      expect(outcome.retriable).toBe(false);
      if (outcome.status === 'FAILED') {
        expect(outcome.error).toContain('Exhausted');
        expect(outcome.failureReason).toBe('MAX_ATTEMPTS_EXCEEDED');
      }
      expect(mockRpcServer.sendTransaction).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS = 3
    });
  });

  describe('RPC Failover', () => {
    it('should failover to backup RPC on network error', async () => {
      const getRpcStatusSpy = jest.spyOn(service, 'getRpcStatus');

      mockRpcServer.sendTransaction
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({ hash: 'failover-tx' });

      mockRpcServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12355,
      });

      const randomness = { seed: 'seed', proof: 'proof' };
      const outcome = await service.submitRandomnessTyped(126, 'req-24', randomness);

      expect(outcome.status).toBe('SUCCESS');
    });
  });
});
