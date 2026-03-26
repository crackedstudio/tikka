import { Test, TestingModule } from '@nestjs/testing';
import { RandomnessWorker } from '../src/queue/randomness.worker';
import { ContractService } from '../src/contract/contract.service';
import { VrfService } from '../src/randomness/vrf.service';
import { PrngService } from '../src/randomness/prng.service';
import { TxSubmitterService } from '../src/submitter/tx-submitter.service';
import { RandomnessRequest, RandomnessMethod } from '../src/queue/queue.types';
import { HealthService } from '../src/health/health.service';
import { LagMonitorService } from '../src/health/lag-monitor.service';

describe('RandomnessWorker', () => {
  let worker: RandomnessWorker;
  let contractService: ContractService;
  let vrfService: any;
  let prngService: any;
  let txSubmitter: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RandomnessWorker,
        {
          provide: ContractService,
          useValue: {
            getRaffleData: jest.fn(),
            isRandomnessSubmitted: jest.fn(),
          },
        },
        {
          provide: VrfService,
          useValue: {
            compute: jest.fn(),
          },
        },
        {
          provide: PrngService,
          useValue: {
            compute: jest.fn(),
          },
        },
        {
          provide: TxSubmitterService,
          useValue: {
            submitRandomness: jest.fn(),
          },
        },
        {
          provide: HealthService,
          useValue: {
            recordSuccess: jest.fn(),
            recordFailure: jest.fn(),
            updateQueueDepth: jest.fn(),
          },
        },
        {
          provide: LagMonitorService,
          useValue: {
            trackRequest: jest.fn(),
            fulfillRequest: jest.fn(),
            updateCurrentLedger: jest.fn(),
          },
        },
      ],
    }).compile();

    worker = module.get<RandomnessWorker>(RandomnessWorker);
    contractService = module.get<ContractService>(ContractService);
    vrfService = module.get<VrfService>(VrfService);
    prngService = module.get<PrngService>(PrngService);
    txSubmitter = module.get<TxSubmitterService>(TxSubmitterService);
  });

  afterEach(() => {
    worker.clearProcessedCache();
  });

  describe('processRequest - Low Stakes (PRNG)', () => {
    it('should use PRNG for prize < 500 XLM', async () => {
      const request: RandomnessRequest = {
        raffleId: 1,
        requestId: 'req-123',
        prizeAmount: 100,
      };

      jest.spyOn(contractService, 'isRandomnessSubmitted').mockResolvedValue(false);
      prngService.compute.mockResolvedValue({
        seed: 'prng-seed',
        proof: '0'.repeat(128),
      });
      jest.spyOn(txSubmitter, 'submitRandomness').mockResolvedValue({
        txHash: 'tx-hash',
        ledger: 12345,
        success: true,
      });

      await worker.processRequest(request);

      expect(prngService.compute).toHaveBeenCalledWith('req-123');
      expect(vrfService.compute).not.toHaveBeenCalled();
      expect(txSubmitter.submitRandomness).toHaveBeenCalledWith(1, {
        seed: 'prng-seed',
        proof: '0'.repeat(128),
      });
    });
  });

  describe('processRequest - High Stakes (VRF)', () => {
    it('should use VRF for prize >= 500 XLM', async () => {
      const request: RandomnessRequest = {
        raffleId: 2,
        requestId: 'req-456',
        prizeAmount: 1000,
      };

      jest.spyOn(contractService, 'isRandomnessSubmitted').mockResolvedValue(false);
      vrfService.compute.mockResolvedValue({
        seed: 'vrf-seed',
        proof: 'vrf-proof',
      });
      jest.spyOn(txSubmitter, 'submitRandomness').mockResolvedValue({
        txHash: 'tx-hash-2',
        ledger: 12346,
        success: true,
      });

      await worker.processRequest(request);

      expect(vrfService.compute).toHaveBeenCalledWith('req-456');
      expect(prngService.compute).not.toHaveBeenCalled();
      expect(txSubmitter.submitRandomness).toHaveBeenCalledWith(2, {
        seed: 'vrf-seed',
        proof: 'vrf-proof',
      });
    });
  });

  describe('processRequest - Fetch Prize from Contract', () => {
    it('should fetch prize amount if not in event payload', async () => {
      const request: RandomnessRequest = {
        raffleId: 3,
        requestId: 'req-789',
        // prizeAmount not provided
      };

      jest.spyOn(contractService, 'isRandomnessSubmitted').mockResolvedValue(false);
      jest.spyOn(contractService, 'getRaffleData').mockResolvedValue({
        raffleId: 3,
        prizeAmount: 750,
        status: 'DRAWING',
      });
      vrfService.compute.mockResolvedValue({
        seed: 'vrf-seed',
        proof: 'vrf-proof',
      });
      jest.spyOn(txSubmitter, 'submitRandomness').mockResolvedValue({
        txHash: 'tx-hash-3',
        ledger: 12347,
        success: true,
      });

      await worker.processRequest(request);

      expect(contractService.getRaffleData).toHaveBeenCalledWith(3);
      expect(vrfService.compute).toHaveBeenCalled(); // 750 >= 500, uses VRF
    });
  });

  describe('processRequest - Idempotency', () => {
    it('should skip already processed requests', async () => {
      const request: RandomnessRequest = {
        raffleId: 4,
        requestId: 'req-duplicate',
        prizeAmount: 200,
      };

      jest.spyOn(contractService, 'isRandomnessSubmitted').mockResolvedValue(false);
      prngService.compute.mockResolvedValue({
        seed: 'seed',
        proof: '0'.repeat(128),
      });
      jest.spyOn(txSubmitter, 'submitRandomness').mockResolvedValue({
        txHash: 'tx-hash',
        ledger: 12348,
        success: true,
      });

      // Process first time
      await worker.processRequest(request);
      expect(txSubmitter.submitRandomness).toHaveBeenCalledTimes(1);

      // Process second time (duplicate)
      await worker.processRequest(request);
      expect(txSubmitter.submitRandomness).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should skip if contract already finalized', async () => {
      const request: RandomnessRequest = {
        raffleId: 5,
        requestId: 'req-finalized',
        prizeAmount: 300,
      };

      jest.spyOn(contractService, 'isRandomnessSubmitted').mockResolvedValue(true);

      await worker.processRequest(request);

      expect(prngService.compute).not.toHaveBeenCalled();
      expect(txSubmitter.submitRandomness).not.toHaveBeenCalled();
    });
  });

  describe('processRequest - Error Handling', () => {
    it('should throw error on submission failure for retry', async () => {
      const request: RandomnessRequest = {
        raffleId: 6,
        requestId: 'req-fail',
        prizeAmount: 100,
      };

      jest.spyOn(contractService, 'isRandomnessSubmitted').mockResolvedValue(false);
      prngService.compute.mockResolvedValue({
        seed: 'seed',
        proof: '0'.repeat(128),
      });
      jest.spyOn(txSubmitter, 'submitRandomness').mockResolvedValue({
        txHash: '',
        ledger: 0,
        success: false,
      });

      await expect(worker.processRequest(request)).rejects.toThrow();
    });
  });
});
