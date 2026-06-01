import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { HealthService } from '../health/health.service';

describe('MetricsService', () => {
  let service: MetricsService;
  let healthService: HealthService;

  beforeEach(async () => {
    const mockHealthService = {
      // Mock any methods used by MetricsService if needed
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: HealthService,
          useValue: mockHealthService,
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    healthService = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Event Processing Metrics', () => {
    it('should increment events processed counter with labels', () => {
      expect(() => {
        service.incrementEventsProcessed('raffle_created', 'success', 1);
        service.incrementEventsProcessed('ticket_purchased', 'success', 5);
      }).not.toThrow();
    });

    it('should increment events failed counter', () => {
      expect(() => {
        service.incrementEventsFailed('raffle_created', 1);
      }).not.toThrow();
    });

    it('should increment errors counter with error type', () => {
      expect(() => {
        service.incrementErrors('parsing_error', 1);
        service.incrementErrors('network_error', 2);
      }).not.toThrow();
    });
  });

  describe('Lag and Reorg Metrics', () => {
    it('should set lag gauge', () => {
      expect(() => {
        service.setLagLedgers(10);
      }).not.toThrow();
    });

    it('should increment reorg counter', () => {
      expect(() => {
        service.incrementReorgDetected(1);
      }).not.toThrow();
    });

    it('should record poll duration', () => {
      expect(() => {
        service.recordPollDuration(2.5);
      }).not.toThrow();
    });
  });

  describe('Database Metrics', () => {
    it('should record database query duration with operation label', () => {
      expect(() => {
        service.recordDatabaseQueryDuration(0.05, 'select_raffles');
      }).not.toThrow();
    });

    it('should record database latency', () => {
      expect(() => {
        service.recordDatabaseLatency(0.1, 'insert');
        service.recordDatabaseLatency(0.02, 'select');
      }).not.toThrow();
    });

    it('should increment slow query counter', () => {
      expect(() => {
        service.incrementSlowDbQuery('complex_join', 1);
      }).not.toThrow();
    });
  });

  describe('Cache Metrics', () => {
    it('should increment cache hits', () => {
      expect(() => {
        service.incrementCacheHits('redis', 1);
        service.incrementCacheHits('memory', 5);
      }).not.toThrow();
    });

    it('should increment cache misses', () => {
      expect(() => {
        service.incrementCacheMisses('redis', 1);
      }).not.toThrow();
    });

    it('should record cache latency', () => {
      expect(() => {
        service.recordCacheLatency(0.001, 'get', 'redis');
        service.recordCacheLatency(0.002, 'set', 'redis');
      }).not.toThrow();
    });
  });

  describe('Queue and DLQ Metrics', () => {
    it('should increment DLQ messages counter', () => {
      expect(() => {
        service.incrementDlqMessages('raffle-events', 1);
      }).not.toThrow();
    });

    it('should increment retries counter', () => {
      expect(() => {
        service.incrementRetries('raffle-events', 'raffle_created', 1);
      }).not.toThrow();
    });

    it('should set queue depth', () => {
      expect(() => {
        service.setQueueDepth('raffle-events', 100);
        service.setQueueDepth('ticket-events', 50);
      }).not.toThrow();
    });
  });

  describe('Metrics Export', () => {
    it('should return metrics in Prometheus format', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('string');
    });

    it('should include metric names in output', async () => {
      service.incrementEventsProcessed('test_event', 'success', 1);
      service.setLagLedgers(5);
      
      const metrics = await service.getMetrics();
      expect(metrics).toContain('tikka_indexer_events_processed_total');
      expect(metrics).toContain('tikka_indexer_lag_ledgers');
    });
  });
});
