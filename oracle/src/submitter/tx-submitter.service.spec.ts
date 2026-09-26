jest.mock('@stellar/stellar-sdk', () => ({
  BASE_FEE: '100',
  Networks: { TESTNET: 'Test SDF Network ; September 2015' },
  rpc: { Server: jest.fn() },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TxSubmitterService } from './tx-submitter.service';
import { FeeEstimatorService } from './fee-estimator.service';
import { KeyService } from '../keys/key.service';
import { OracleLoggerService } from '../logger/oracle-logger';
import { FeeStrategyService } from './fee-strategy';
import { TxBuilderService } from './tx-builder';
import { SubmissionService } from './submission';

describe('TxSubmitterService', () => {
  let service: TxSubmitterService;
  let mockRpcServer: any;
  let mockSubmissionService: {
    buildServer: jest.Mock;
    submitTransactionWithRetry: jest.Mock;
    pollForConfirmation: jest.Mock;
    pollForConfirmationTyped: jest.Mock;
    getRpcStatus: jest.Mock;
  };

  beforeEach(async () => {
    mockRpcServer = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
      getAccount: jest.fn().mockResolvedValue({ accountId: () => 'GTEST' }),
      prepareTransaction: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
      simulateTransaction: jest.fn().mockResolvedValue({ error: null }),
      sendTransaction: jest.fn(),
      getTransaction: jest.fn(),
    };

    mockSubmissionService = {
      buildServer: jest.fn().mockReturnValue(mockRpcServer),
      submitTransactionWithRetry: jest.fn().mockResolvedValue({
        outcome: { status: 'SUCCESS', txHash: 'abc', ledger: 12345, feePaid: 100, retriable: false },
        shouldRetry: false,
        bumpFee: false
      }),
      pollForConfirmation: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 12345 }),
      pollForConfirmationTyped: jest.fn(),
      getRpcStatus: jest.fn().mockResolvedValue([{ url: 'test', healthy: true }])
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TxSubmitterService,
        { provide: OracleLoggerService, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
          if (key === 'RAFFLE_CONTRACT_ID') return 'CABC';
          if (key === 'SOROBAN_RPC_URL') return 'https://rpc.example';
          return fallback;
        }) } },
        { provide: FeeEstimatorService, useValue: { estimateFee: jest.fn().mockResolvedValue({ cappedFee: 1000 }) } },
        { provide: KeyService, useValue: { getPublicKey: jest.fn().mockResolvedValue('GTEST'), signTransaction: jest.fn() } },
        { provide: FeeStrategyService, useValue: { recordRevealCost: jest.fn(), recordSubmissionRetry: jest.fn(), recordSubmissionFailure: jest.fn(), recordFeeBump: jest.fn() } },
        { provide: TxBuilderService, useValue: { buildPreparedTx: jest.fn(), buildCommitmentTx: jest.fn(), buildRevealTx: jest.fn() } },
        { provide: SubmissionService, useValue: mockSubmissionService },
      ],
    }).compile();

    service = module.get<TxSubmitterService>(TxSubmitterService);
  });

  it('should successfully submit transaction on first try', async () => {
    const randomness = { seed: 'seed123', proof: 'proof456' };
    const outcome = await service.submitRandomnessTyped(100, 'req-1', randomness);
    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status === 'SUCCESS') {
      expect(outcome.txHash).toBe('abc');
      expect(outcome.ledger).toBe(12345);
    }
  });

  it('should fallback to submitting legacy randomness', async () => {
    const randomness = { seed: 'seed', proof: 'proof' };
    const result = await service.submitRandomness(122, randomness);
    expect(result.success).toBe(true);
    expect(result.txHash).toBe('abc');
    expect(result.ledger).toBe(12345);
  });

  it('returns an ambiguous timeout from submission without submitting again', async () => {
    mockSubmissionService.submitTransactionWithRetry.mockResolvedValue({
      outcome: { status: 'TIMEOUT', txHash: 'abc', error: 'confirmation timeout', retriable: false, pollAttempts: 2 },
      shouldRetry: false,
      bumpFee: false,
    });

    const outcome = await service.submitRandomnessTyped(9, 'req-9', { seed: 'seed', proof: 'proof' });

    expect(outcome).toMatchObject({ status: 'TIMEOUT', retriable: false, txHash: 'abc' });
    expect(mockSubmissionService.submitTransactionWithRetry).toHaveBeenCalledTimes(1);
  });
});
