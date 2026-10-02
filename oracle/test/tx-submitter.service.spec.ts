jest.mock('@stellar/stellar-sdk', () => ({
  BASE_FEE: '100',
  Networks: { TESTNET: 'Test SDF Network ; September 2015' },
  rpc: { Server: jest.fn() },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TxSubmitterService } from '../src/submitter/tx-submitter.service';
import { FeeEstimatorService } from '../src/submitter/fee-estimator.service';
import { KeyService } from '../src/keys/key.service';
import { OracleLoggerService } from '../src/logger/oracle-logger';
import { FeeStrategyService } from '../src/submitter/fee-strategy';
import { TxBuilderService } from '../src/submitter/tx-builder';
import { SubmissionService } from '../src/submitter/submission';

describe('TxSubmitterService orchestration', () => {
  let service: TxSubmitterService;
  let submission: { submitTransactionWithRetry: jest.Mock; buildServer: jest.Mock; pollForConfirmation: jest.Mock; getRpcStatus: jest.Mock };
  let feeStrategy: { recordRevealCost: jest.Mock; recordSubmissionFailure: jest.Mock; recordFeeBump: jest.Mock; recordSubmissionRetry: jest.Mock };

  beforeEach(async () => {
    submission = {
      buildServer: jest.fn().mockReturnValue({}),
      submitTransactionWithRetry: jest.fn().mockResolvedValue({
        outcome: { status: 'SUCCESS', txHash: 'ok-hash', ledger: 42, feePaid: 100, retriable: false },
        shouldRetry: false,
        bumpFee: false,
      }),
      pollForConfirmation: jest.fn(),
      getRpcStatus: jest.fn().mockResolvedValue([]),
    };
    feeStrategy = {
      recordRevealCost: jest.fn(),
      recordSubmissionFailure: jest.fn(),
      recordFeeBump: jest.fn(),
      recordSubmissionRetry: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TxSubmitterService,
        { provide: OracleLoggerService, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
          if (key === 'RAFFLE_CONTRACT_ID') return 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
          if (key === 'SOROBAN_RPC_URL') return 'https://example.com';
          return fallback;
        }) } },
        { provide: FeeEstimatorService, useValue: { estimateFee: jest.fn().mockResolvedValue({ cappedFee: 100 }) } },
        { provide: KeyService, useValue: { getPublicKey: jest.fn().mockResolvedValue('GTEST'), signTransaction: jest.fn() } },
        { provide: FeeStrategyService, useValue: feeStrategy },
        { provide: TxBuilderService, useValue: { buildPreparedTx: jest.fn().mockResolvedValue({}), buildCommitmentTx: jest.fn(), buildRevealTx: jest.fn() } },
        { provide: SubmissionService, useValue: submission },
      ],
    }).compile();

    service = module.get(TxSubmitterService);
  });

  it('delegates a successful reveal to the submission service and records the cost', async () => {
    const result = await service.submitRandomness(1, { seed: 'seed', proof: 'proof' });

    expect(result).toMatchObject({ success: true, txHash: 'ok-hash', ledger: 42 });
    expect(submission.submitTransactionWithRetry).toHaveBeenCalledTimes(1);
    expect(feeStrategy.recordRevealCost).toHaveBeenCalled();
  });

  it('records a submission failure when the unit layer returns an ambiguous timeout', async () => {
    submission.submitTransactionWithRetry.mockResolvedValue({
      outcome: { status: 'TIMEOUT', txHash: 'maybe', error: 'timeout', retriable: false, pollAttempts: 1 },
      shouldRetry: false,
      bumpFee: false,
    });

    const result = await service.submitRandomness(2, { seed: 'seed', proof: 'proof' });

    expect(result.success).toBe(false);
    expect(submission.submitTransactionWithRetry).toHaveBeenCalledTimes(1);
    expect(feeStrategy.recordSubmissionFailure).toHaveBeenCalledWith(2, 'PRNG', 'timeout');
  });
});
