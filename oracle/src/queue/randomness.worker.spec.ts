import { Test, TestingModule } from '@nestjs/testing';
import { RandomnessWorker } from './randomness.worker';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { OracleRegistryService } from '../multi-oracle/oracle-registry.service';
import { MultiOracleCoordinatorService } from '../multi-oracle/multi-oracle-coordinator.service';
import { JobPriority } from './queue.types';

describe('RandomnessWorker', () => {
  let worker: RandomnessWorker;
  let contractService: jest.Mocked<ContractService>;
  let vrfService: jest.Mocked<VrfService>;
  let prngService: jest.Mocked<PrngService>;
  let txSubmitter: jest.Mocked<TxSubmitterService>;
  let healthService: jest.Mocked<HealthService>;
  let lagMonitor: jest.Mocked<LagMonitorService>;
  let oracleRegistry: jest.Mocked<OracleRegistryService>;
  let multiOracleCoordinator: jest.Mocked<MultiOracleCoordinatorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RandomnessWorker,
        {
          provide: ContractService,
          useValue: {
            isRandomnessSubmitted: jest.fn(),
            getRaffleData: jest.fn(),
          },
        },
        {
          provide: VrfService,
          useValue: {
            compute: jest.fn(),
            computeForOracle: jest.fn(),
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
          },
        },
        {
          provide: LagMonitorService,
          useValue: {
            fulfillRequest: jest.fn(),
          },
        },
        {
          provide: OracleRegistryService,
          useValue: {
            isMultiOracleMode: jest.fn().mockReturnValue(false),
            getLocalOracleId: jest.fn(),
            getThreshold: jest.fn(),
            getLocalOracle: jest.fn(),
          },
        },
        {
          provide: MultiOracleCoordinatorService,
          useValue: {
            isTracked: jest.fn(),
            startTracking: jest.fn(),
            hasSubmitted: jest.fn(),
            recordSubmission: jest.fn(),
          },
        },
      ],
    }).compile();

    worker = module.get<RandomnessWorker>(RandomnessWorker);
    contractService = module.get(ContractService);
    vrfService = module.get(VrfService);
    prngService = module.get(PrngService);
    txSubmitter = module.get(TxSubmitterService);
    healthService = module.get(HealthService);
    lagMonitor = module.get(LagMonitorService);
    oracleRegistry = module.get(OracleRegistryService);
    multiOracleCoordinator = module.get(MultiOracleCoordinatorService);
  });

  describe('determinePriority', () => {
    it('should return HIGH priority for prizes >= 500 XLM', () => {
      expect(worker.determinePriority(500)).toBe(JobPriority.HIGH);
      expect(worker.determinePriority(1000)).toBe(JobPriority.HIGH);
      expect(worker.determinePriority(5000)).toBe(JobPriority.HIGH);
    });

    it('should return NORMAL priority for prizes < 500 XLM', () => {
      expect(worker.determinePriority(100)).toBe(JobPriority.NORMAL);
      expect(worker.determinePriority(499)).toBe(JobPriority.NORMAL);
      expect(worker.determinePriority(50)).toBe(JobPriority.NORMAL);
    });

    it('should return NORMAL priority when prize amount is undefined', () => {
      expect(worker.determinePriority(undefined)).toBe(JobPriority.NORMAL);
    });

    it('should return NORMAL priority when prize amount is 0', () => {
      expect(worker.determinePriority(0)).toBe(JobPriority.NORMAL);
    });

    it('should prioritize contract flag over prize amount', () => {
      // High prize but CRITICAL flag
      expect(worker.determinePriority(1000, JobPriority.CRITICAL)).toBe(JobPriority.CRITICAL);
      
      // Low prize but HIGH flag
      expect(worker.determinePriority(100, JobPriority.HIGH)).toBe(JobPriority.HIGH);
      
      // High prize but LOW flag
      expect(worker.determinePriority(1000, JobPriority.LOW)).toBe(JobPriority.LOW);
    });

    it('should handle explicit NORMAL priority flag', () => {
      expect(worker.determinePriority(1000, JobPriority.NORMAL)).toBe(JobPriority.NORMAL);
    });

    it('should handle priority flag of 0 (CRITICAL)', () => {
      expect(worker.determinePriority(100, 0)).toBe(0);
    });
  });

  describe('Priority edge cases', () => {
    it('should handle exactly 500 XLM threshold', () => {
      expect(worker.determinePriority(500)).toBe(JobPriority.HIGH);
      expect(worker.determinePriority(499.99)).toBe(JobPriority.NORMAL);
      expect(worker.determinePriority(500.01)).toBe(JobPriority.HIGH);
    });

    it('should handle very large prize amounts', () => {
      expect(worker.determinePriority(1000000)).toBe(JobPriority.HIGH);
      expect(worker.determinePriority(Number.MAX_SAFE_INTEGER)).toBe(JobPriority.HIGH);
    });

    it('should handle negative prize amounts gracefully', () => {
      // Negative amounts should be treated as low stakes
      expect(worker.determinePriority(-100)).toBe(JobPriority.NORMAL);
    });
  });

  describe('Priority with contract flags', () => {
    it('should accept all valid JobPriority enum values', () => {
      expect(worker.determinePriority(100, JobPriority.CRITICAL)).toBe(JobPriority.CRITICAL);
      expect(worker.determinePriority(100, JobPriority.HIGH)).toBe(JobPriority.HIGH);
      expect(worker.determinePriority(100, JobPriority.NORMAL)).toBe(JobPriority.NORMAL);
      expect(worker.determinePriority(100, JobPriority.LOW)).toBe(JobPriority.LOW);
    });

    it('should handle custom numeric priority values', () => {
      // Contract might send custom priority values
      expect(worker.determinePriority(100, 2)).toBe(2);
      expect(worker.determinePriority(100, 15)).toBe(15);
    });
  });
});
