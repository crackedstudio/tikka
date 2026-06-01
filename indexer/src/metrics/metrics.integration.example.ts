/**
 * Example integration patterns for MetricsService
 * 
 * This file demonstrates how to integrate metrics into various parts of the indexer.
 * Copy these patterns into your actual service implementations.
 */

import { Injectable } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * Example: Event Processor with Metrics
 */
@Injectable()
export class ExampleEventProcessor {
  constructor(private readonly metricsService: MetricsService) {}

  async processEvent(event: any) {
    const eventType = event.type || 'unknown';
    
    try {
      // Process the event
      await this.handleEvent(event);
      
      // Record success
      this.metricsService.incrementEventsProcessed(eventType, 'success', 1);
    } catch (error) {
      // Record failure
      this.metricsService.incrementEventsFailed(eventType, 1);
      this.metricsService.incrementErrors('processing_error', 1);
      throw error;
    }
  }

  private async handleEvent(event: any) {
    // Event processing logic
  }
}

/**
 * Example: Database Repository with Metrics
 */
@Injectable()
export class ExampleRepository {
  constructor(private readonly metricsService: MetricsService) {}

  async findRaffleById(id: string) {
    const operation = 'select_raffle_by_id';
    const start = Date.now();
    
    try {
      // Simulate database query
      const result = await this.executeQuery('SELECT * FROM raffles WHERE id = $1', [id]);
      
      const duration = (Date.now() - start) / 1000;
      
      // Record query duration
      this.metricsService.recordDatabaseQueryDuration(duration, operation);
      this.metricsService.recordDatabaseLatency(duration, 'select');
      
      // Track slow queries (threshold: 1 second)
      if (duration > 1.0) {
        this.metricsService.incrementSlowDbQuery(operation, 1);
      }
      
      return result;
    } catch (error) {
      this.metricsService.incrementErrors('database_error', 1);
      throw error;
    }
  }

  async insertRaffle(raffle: any) {
    const operation = 'insert_raffle';
    const start = Date.now();
    
    try {
      const result = await this.executeQuery('INSERT INTO raffles ...', [raffle]);
      
      const duration = (Date.now() - start) / 1000;
      this.metricsService.recordDatabaseQueryDuration(duration, operation);
      this.metricsService.recordDatabaseLatency(duration, 'insert');
      
      return result;
    } catch (error) {
      this.metricsService.incrementErrors('database_error', 1);
      throw error;
    }
  }

  private async executeQuery(sql: string, params: any[]) {
    // Database query execution
    return {};
  }
}

/**
 * Example: Cache Service with Metrics
 */
@Injectable()
export class ExampleCacheService {
  constructor(private readonly metricsService: MetricsService) {}

  async get(key: string): Promise<any> {
    const cacheType = 'redis';
    const start = Date.now();
    
    try {
      const value = await this.redisClient.get(key);
      const duration = (Date.now() - start) / 1000;
      
      if (value !== null) {
        this.metricsService.incrementCacheHits(cacheType, 1);
      } else {
        this.metricsService.incrementCacheMisses(cacheType, 1);
      }
      
      this.metricsService.recordCacheLatency(duration, 'get', cacheType);
      
      return value;
    } catch (error) {
      this.metricsService.incrementErrors('cache_error', 1);
      throw error;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const cacheType = 'redis';
    const start = Date.now();
    
    try {
      await this.redisClient.set(key, value, ttl);
      const duration = (Date.now() - start) / 1000;
      
      this.metricsService.recordCacheLatency(duration, 'set', cacheType);
    } catch (error) {
      this.metricsService.incrementErrors('cache_error', 1);
      throw error;
    }
  }

  private redisClient = {
    get: async (key: string) => null,
    set: async (key: string, value: any, ttl?: number) => {},
  };
}

/**
 * Example: Queue Processor with Metrics
 */
@Injectable()
export class ExampleQueueProcessor {
  constructor(private readonly metricsService: MetricsService) {}

  async processJob(job: any, queueName: string) {
    const eventType = job.data?.type || 'unknown';
    
    try {
      await this.handleJob(job);
      this.metricsService.incrementEventsProcessed(eventType, 'success', 1);
    } catch (error) {
      // Check if this is a retry
      if (job.attemptsMade > 0) {
        this.metricsService.incrementRetries(queueName, eventType, 1);
      }
      
      // Check if max retries exceeded (send to DLQ)
      if (job.attemptsMade >= job.opts.attempts) {
        this.metricsService.incrementDlqMessages(queueName, 1);
      }
      
      this.metricsService.incrementEventsFailed(eventType, 1);
      throw error;
    }
  }

  async updateQueueMetrics(queueName: string, queue: any) {
    // Get current queue depth
    const waitingCount = await queue.getWaitingCount();
    const activeCount = await queue.getActiveCount();
    const depth = waitingCount + activeCount;
    
    this.metricsService.setQueueDepth(queueName, depth);
  }

  private async handleJob(job: any) {
    // Job processing logic
  }
}

/**
 * Example: Ingestor with Lag Tracking
 */
@Injectable()
export class ExampleIngestor {
  constructor(private readonly metricsService: MetricsService) {}

  async pollLedgers() {
    const start = Date.now();
    
    try {
      const networkLedger = await this.getNetworkLedger();
      const currentLedger = await this.getCurrentLedger();
      
      // Calculate and record lag
      const lag = networkLedger - currentLedger;
      this.metricsService.setLagLedgers(lag);
      
      // Process ledgers
      await this.processLedgers(currentLedger, networkLedger);
      
      // Record poll duration
      const duration = (Date.now() - start) / 1000;
      this.metricsService.recordPollDuration(duration);
    } catch (error) {
      this.metricsService.incrementErrors('polling_error', 1);
      throw error;
    }
  }

  async handleReorg(fromLedger: number, toLedger: number) {
    this.metricsService.incrementReorgDetected(1);
    // Handle reorg logic
  }

  private async getNetworkLedger(): Promise<number> {
    return 1000;
  }

  private async getCurrentLedger(): Promise<number> {
    return 995;
  }

  private async processLedgers(from: number, to: number) {
    // Processing logic
  }
}

/**
 * Example: Periodic Queue Depth Monitoring
 */
@Injectable()
export class ExampleQueueMonitor {
  constructor(private readonly metricsService: MetricsService) {}

  startMonitoring(queues: Map<string, any>) {
    // Update queue metrics every 10 seconds
    setInterval(async () => {
      for (const [queueName, queue] of queues.entries()) {
        try {
          const waiting = await queue.getWaitingCount();
          const active = await queue.getActiveCount();
          const delayed = await queue.getDelayedCount();
          
          const depth = waiting + active + delayed;
          this.metricsService.setQueueDepth(queueName, depth);
        } catch (error) {
          // Log error but don't throw
          console.error(`Failed to update metrics for queue ${queueName}:`, error);
        }
      }
    }, 10000);
  }
}
