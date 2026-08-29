import { OracleLoggerService, CorrelationContext, OracleLogFields } from '../logger/oracle-logger';
import { RandomnessRequest, RandomnessMethod, RandomnessResult, JobPriority } from './queue.types';
import { JobState } from './job-state.types';
import { JobStateManager } from './job-state-manager';
import { RandomnessProcessorService } from './randomness-processor.service';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { OracleRegistryService } from '../multi-oracle/oracle-registry.service';
import { MultiOracleCoordinatorService } from '../multi-oracle/multi-oracle-coordinator.service';
import { PriorityClassifierService } from './priority-classifier.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AlertingService } from '../health/alerting.service';
import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { RANDOMNESS_QUEUE, RandomnessJobPayload } from './randomness.queue';
import { Injectable, Logger, OnApplicationShutdown, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../metrics/metrics.service';

const DLQ_DEPTH_ALERT_DEDUP_KEY = 'dlq-depth-threshold';

@Processor(RANDOMNESS_QUEUE)
@Injectable()
export class RandomnessWorker implements OnApplicationShutdown {

  private readonly vrfThresholdXlm: number;
  private readonly dlqDepthAlertThreshold: number;
  private readonly processedRequestIds = new Set<string>();
  private highPriorityJobStartTimes = new Map<string, number>();
  private shuttingDown = false;
  private readonly activeJobPromises = new Map<string, Promise<void>>();
  private readonly shutdownTimeoutMs: number;

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly stateManager: JobStateManager,
    private readonly processor: RandomnessProcessorService,
    private readonly contractService: ContractService,
    private readonly vrfService: VrfService,
    private readonly prngService: PrngService,
    private readonly txSubmitter: TxSubmitterService,
    private readonly healthService: HealthService,
    private readonly lagMonitor: LagMonitorService,
    private readonly oracleRegistry: OracleRegistryService,
    private readonly multiOracleCoordinator: MultiOracleCoordinatorService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
    private readonly alertingService: AlertingService,
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() @InjectQueue(RANDOMNESS_QUEUE) private readonly randomnessQueue?: Queue,
  ) {
    this.vrfThresholdXlm = Number(
      this.configService.get<string>('VRF_THRESHOLD_XLM', '500'),
    );
    this.dlqDepthAlertThreshold = Number(
      this.configService.get<string>('DLQ_DEPTH_ALERT_THRESHOLD', '5'),
    );
    this.shutdownTimeoutMs = Number(
      this.configService.get<string>('ORACLE_SHUTDOWN_HARD_TIMEOUT_MS', '25000'),
    );
  }

  @Process()
  async handleRandomnessJob(job: Job<RandomnessJobPayload>): Promise<void> {
    if (this.shuttingDown) {
      throw new Error('Oracle shutting down — rejecting job for retry');
    }

    const jobPromise = CorrelationContext.run(String(job.id), async () => {
    // Main-loop heartbeat — updated on every job the queue worker picks up.
    this.metricsService?.recordComponentHeartbeat('queue');

    const priority = job.opts.priority ?? JobPriority.NORMAL;
    const isHighPriority = priority <= JobPriority.HIGH;
    
    if (isHighPriority) {
      this.highPriorityJobStartTimes.set(job.data.requestId, Date.now());
    }

    this.logger.log(
      `Processing randomness request job ${job.id} for raffle ${job.data.raffleId}, request ${job.data.requestId}, priority=${priority}`,
      JSON.stringify({ raffle_id: job.data.raffleId, request_id: job.data.requestId } as OracleLogFields),
    );
    
    // Use the new processor with state management
    const result = await this.processor.processRequest(job.data);

    if (!result.success && result.shouldRetry) {
      // Increment attempt and check if we should dead-letter
      const shouldDeadLetter = this.stateManager.incrementAttempt(job.data.requestId);
      
      if (shouldDeadLetter) {
        this.stateManager.transitionState(
          job.data.requestId,
          JobState.DEAD_LETTERED,
          `Exhausted ${this.stateManager.getConfig().maxRetries} attempts`,
          result.error,
        );
        this.logger.error(
          `[DEAD-LETTER] Job ${job.id} for raffle ${job.data.raffleId}, request ${job.data.requestId} ` +
          `exhausted all retry attempts. Manual intervention required.`,
        );
        this.checkDlqDepthAlert(job.data.raffleId);
        await this.quarantineJob(job, new Error(`Dead-lettered: ${result.error}`));
        return;
      } else {
        // Calculate backoff and schedule retry
        const backoffMs = this.stateManager.calculateBackoff(
          this.stateManager.getJobMetadata(job.data.requestId)?.attemptCount ?? 0,
        );
        this.logger.warn(
          `Job ${job.id} will retry after ${backoffMs}ms backoff (attempt ${this.stateManager.getJobMetadata(job.data.requestId)?.attemptCount})`,
        );
        await this.delay(backoffMs);
        throw new Error(`Retry: ${result.error}`);
      }
    } else if (!result.success) {
      // Non-retriable failure
      this.logger.error(
        `[FAILED] Job ${job.id} for raffle ${job.data.raffleId}, request ${job.data.requestId} ` +
        `failed with non-retriable error: ${result.error}`,
      );
      await this.quarantineJob(job, new Error(`Failed: ${result.error}`));
      return;
    }

    if (isHighPriority) {
      this.trackHighPrioritySLA(job.data.requestId);
    }
    } catch (err: any) {
      const maxRetries = this.stateManager.getConfig().maxRetries;
      const attemptCount = job.attemptsMade + 1; // Include the current attempt

      if (attemptCount >= maxRetries) {
        if (job.data?.requestId) {
          this.stateManager.transitionState(
            job.data.requestId,
            JobState.DEAD_LETTERED,
            `Exhausted ${maxRetries} attempts due to handler crash`,
            err.message
          );
        }
        await this.quarantineJob(job, err);
        return;
      }
      throw err; // Let Bull retry it
    }
    }); // end CorrelationContext.run

    this.activeJobPromises.set(String(job.id), jobPromise);
    try {
      await jobPromise;
    } finally {
      this.activeJobPromises.delete(String(job.id));
    }
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      `Shutdown initiated (${signal}) — pausing queue and draining active jobs`,
    );
    this.shuttingDown = true;

    try {
      await this.randomnessQueue?.pause(true, true);
    } catch (err) {
      this.logger.warn(`Failed to pause randomness queue during shutdown: ${err}`);
    }

    const activePromises = Array.from(this.activeJobPromises.values());

    if (activePromises.length === 0) {
      this.logger.log('No active jobs to drain');
      return;
    }

    this.logger.log(`Waiting for ${activePromises.length} active job(s) to finish`);

    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, this.shutdownTimeoutMs),
    );

    await Promise.race([Promise.all(activePromises), timeoutPromise]);

    const remaining = this.activeJobPromises.size;
    if (remaining > 0) {
      this.logger.warn(
        `Shutdown timeout exceeded — ${remaining} job(s) still in-flight. These will be retried or require rescue.`,
      );
      try {
        await this.alertingService.fire({
          severity: 'critical',
          summary: `Oracle shutdown stranded ${remaining} active randomness job(s)`,
          details: `Signal: ${signal}. Jobs may require rescue intervention.`,
          dedupKey: 'oracle-shutdown-stranded-jobs',
          context: {
            oracle_id: process.env.LOCAL_ORACLE_ID || 'oracle-001',
          },
        });
      } catch (alertErr) {
        this.logger.error(
          `Failed to fire shutdown stranded-jobs alert: ${alertErr}`,
        );
      }
    } else {
      this.logger.log('All active jobs drained successfully');
    }
  }

  private async quarantineJob(job: Job<RandomnessJobPayload>, error: any) {
    const errorMsg = error?.message || String(error);
    this.logger.error(`[QUARANTINE] Job ${job.id} (raffle ${job.data?.raffleId}) quarantined. Error: ${errorMsg}`);
    this.healthService.recordQuarantine(job.data?.requestId || 'unknown', errorMsg);
    
    try {
      const client = job.queue.client;
      await client.rpush(
        'oracle:quarantine:randomness',
        JSON.stringify({
          jobId: job.id,
          data: job.data,
          error: errorMsg,
          stack: error?.stack,
          quarantinedAt: new Date().toISOString()
        })
      );
    } catch (redisError) {
      this.logger.error(`Failed to push job ${job.id} to quarantine list in Redis: ${redisError}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Fires a critical alert when the dead-letter queue depth exceeds the configured threshold. */
  private checkDlqDepthAlert(raffleId: number): void {
    const deadLetteredCount = this.stateManager.getMetrics().deadLetteredCount;

    if (deadLetteredCount >= this.dlqDepthAlertThreshold) {
      void this.alertingService.fire({
        severity: 'critical',
        summary: `Dead-letter queue depth (${deadLetteredCount}) exceeds threshold (${this.dlqDepthAlertThreshold})`,
        details: `Most recently dead-lettered job was for raffle ${raffleId}. Manual rescue intervention required.`,
        dedupKey: DLQ_DEPTH_ALERT_DEDUP_KEY,
        context: {
          oracle_id: process.env.LOCAL_ORACLE_ID || 'oracle-001',
          raffle_id: raffleId,
        },
      });
    }
  }

  clearProcessedCache() {
    this.processedRequestIds.clear();
  }

  async processRequest(request: RandomnessRequest): Promise<void> {
    const { raffleId, requestId, prizeAmount } = request;

    if (this.processedRequestIds.has(requestId)) {
      return;
    }

    // Support ORACLE_MODE=multi env toggle as well as legacy isMultiOracleMode()
    const oracleMode = this.configService.get<string>('ORACLE_MODE', 'single').toLowerCase();
    const isMultiOracle = oracleMode === 'multi' || this.oracleRegistry.isMultiOracleMode();
    const localOracleId = this.oracleRegistry.getLocalOracleId();

    if (isMultiOracle) {
      await this.processMultiOracleRequest(request, localOracleId);
    } else {
      await this.processSingleOracleRequest(request);
    }
  }

  private async processSingleOracleRequest(request: RandomnessRequest): Promise<void> {
    const { raffleId, requestId } = request;

    try {
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        this.logger.warn(`Raffle ${raffleId} already finalized, skipping`);
        return;
      }

      const raffleData = await this.contractService.getRaffleData(raffleId);
      const finalPrizeAmount = raffleData.prizeAmount;

      const method = this.determineMethod(finalPrizeAmount);
      const provider: OracleLogFields['provider'] = method === RandomnessMethod.VRF ? 'vrf' : 'prng';
      this.logger.log(
        `requestId=${requestId} raffle=${raffleId} prize=${finalPrizeAmount} provider=${provider}`,
        JSON.stringify({ raffle_id: raffleId, request_id: requestId, provider } as OracleLogFields),
      );

      const randomness = await this.computeRandomness(method, requestId, raffleId);
      const result = await this.txSubmitter.submitRandomness(raffleId, randomness);

      if (!result.success) {
        throw new Error(`Transaction submission failed for raffle ${raffleId}`);
      }

      // Record audit log immediately after successful submission
      const oracleAddress = await this.txSubmitter['keyService'].getPublicKey();
      await this.auditLogService.record({
        raffleId,
        vrfProof: randomness.proof,
        txHash: result.txHash,
        ledger: result.ledger,
        oracleAddress,
        timestamp: new Date(),
        requestId,
      });

      this.processedRequestIds.add(requestId);

      this.logger.log(
        `Successfully submitted randomness for raffle ${raffleId}: tx=${result.txHash}, ledger=${result.ledger}`,
        JSON.stringify({ raffle_id: raffleId, request_id: requestId, tx_hash: result.txHash, ledger: result.ledger, provider, outcome: 'success' } as OracleLogFields),
      );
      this.healthService.recordSuccess(requestId);
      this.lagMonitor.fulfillRequest(requestId);
    } catch (error) {
      this.logger.error(
        `Failed to process randomness request for raffle ${raffleId}: ${error.message}`,
        JSON.stringify({ raffle_id: raffleId, request_id: requestId, outcome: 'failure' } as OracleLogFields),
      );
      this.healthService.recordFailure(requestId, raffleId, error.message);
      throw error;
    }
  }

  private async processMultiOracleRequest(
    request: RandomnessRequest,
    localOracleId: string,
  ): Promise<void> {
    const { raffleId, requestId } = request;
    const threshold = this.oracleRegistry.getThreshold();

    this.logger.log(
      `Multi-oracle mode: raffle=${raffleId}, request=${requestId}, localOracle=${localOracleId}, threshold=${threshold}`,
      JSON.stringify({ raffle_id: raffleId, request_id: requestId, oracle_id: localOracleId } as OracleLogFields),
    );

    try {
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        this.logger.warn(`Raffle ${raffleId} already finalized, skipping`);
        return;
      }

      const raffleData = await this.contractService.getRaffleData(raffleId);
      const finalPrizeAmount = raffleData.prizeAmount;

      const method = this.determineMethod(finalPrizeAmount);
      const provider: OracleLogFields['provider'] = method === RandomnessMethod.VRF ? 'vrf' : 'prng';
      this.logger.log(
        `requestId=${requestId} raffle=${raffleId} prize=${finalPrizeAmount} provider=${provider}`,
        JSON.stringify({ raffle_id: raffleId, request_id: requestId, provider, oracle_id: localOracleId } as OracleLogFields),
      );

      // Compute local oracle's VRF output
      const localRandomness = await this.computeRandomness(method, requestId);

      // Broadcast to peers and collect responses; aggregate via XOR
      const { aggregated, usedOracles, fellBack } =
        await this.multiOracleCoordinator.broadcastAndCollect(requestId, localRandomness);

      if (fellBack) {
        this.logger.warn(
          `Raffle ${raffleId}: fell back to single-oracle (threshold not met in time)`
        );
      } else {
        this.logger.log(
          `Raffle ${raffleId}: consensus from [${usedOracles.join(', ')}], submitting aggregated seed`
        );
      }

      const result = await this.txSubmitter.submitRandomness(raffleId, aggregated);

      if (!result.success) {
        throw new Error(`Transaction submission failed for raffle ${raffleId}`);
      }

      // Record audit log immediately after successful submission
      const oracleAddress = await this.txSubmitter['keyService'].getPublicKey();
      await this.auditLogService.record({
        raffleId,
        vrfProof: aggregated.proof,
        txHash: result.txHash,
        ledger: result.ledger,
        oracleAddress,
        timestamp: new Date(),
        requestId,
      });

      this.processedRequestIds.add(requestId);

      // Record in coordinator for observability
      if (!this.multiOracleCoordinator.isTracked(raffleId, requestId)) {
        await this.multiOracleCoordinator.startTracking(raffleId, requestId);
      }
      const localOracle = this.oracleRegistry.getLocalOracle();
      if (localOracle) {
       this.multiOracleCoordinator.recordSubmission(
  raffleId, requestId, localOracleId, localOracle.publicKey, aggregated
        );
      }

      this.logger.log(
        `Successfully submitted multi-oracle randomness for raffle ${raffleId}: tx=${result.txHash}, ledger=${result.ledger}`,
        JSON.stringify({ raffle_id: raffleId, request_id: requestId, tx_hash: result.txHash, ledger: result.ledger, provider, oracle_id: localOracleId, outcome: 'success' } as OracleLogFields),
      );
      this.healthService.recordSuccess(requestId);
      this.lagMonitor.fulfillRequest(requestId);
    } catch (error) {
      this.logger.error(
        `Failed to process multi-oracle request for raffle ${raffleId}: ${error.message}`,
        JSON.stringify({ raffle_id: raffleId, request_id: requestId, oracle_id: localOracleId, outcome: 'failure' } as OracleLogFields),
      );
      this.healthService.recordFailure(`${requestId}:${localOracleId}`, raffleId, error.message);
      throw error;
    }
  }

  async computeRandomnessForOracle(
    method: RandomnessMethod,
    requestId: string,
    oracleId: string,
  ): Promise<RandomnessResult> {
    if (method === RandomnessMethod.VRF) {
      return this.vrfService.computeForOracle(requestId, oracleId);
    } else {
      return this.prngService.compute(requestId);
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}...`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.debug(`Completed job ${job.id} of type ${job.name}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}: ${err.message}`);
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      this.logger.error(
        `[ALERT] Job ${job.id} exhausted all ${job.opts.attempts} attempts for raffle ${job.data?.raffleId}, request ${job.data?.requestId}. Manual intervention required.`,
      );
    }
  }

  private determineMethod(prizeAmount: number): RandomnessMethod {
    return prizeAmount >= this.vrfThresholdXlm
      ? RandomnessMethod.VRF
      : RandomnessMethod.PRNG;
  }

  private async computeRandomness(method: RandomnessMethod, requestId: string, raffleId?: number) {
    if (method === RandomnessMethod.VRF) {
      return await this.vrfService.compute(requestId, raffleId);
    } else {
      return await this.prngService.compute(requestId, raffleId);
    }
  }

  private trackHighPrioritySLA(requestId: string): void {
    const startTime = this.highPriorityJobStartTimes.get(requestId);
    if (!startTime) return;

    const processingTime = Date.now() - startTime;
    const SLA_THRESHOLD_MS = 5000; // 5 seconds for high-priority jobs

    if (processingTime > SLA_THRESHOLD_MS) {
      this.logger.warn(
        `[SLA BREACH] High-priority job ${requestId} took ${processingTime}ms (threshold: ${SLA_THRESHOLD_MS}ms)`,
      );
    } else {
      this.logger.log(
        `[SLA OK] High-priority job ${requestId} completed in ${processingTime}ms`,
      );
    }

    this.highPriorityJobStartTimes.delete(requestId);
  }

  determinePriority(prizeAmount?: number, priorityFlag?: number): number {
    // If priority flag is explicitly set in contract event, use it
    if (priorityFlag !== undefined) {
      return priorityFlag;
    }

    // Otherwise, determine priority based on prize amount
    if (!prizeAmount) {
      return JobPriority.NORMAL;
    }

    if (prizeAmount >= this.vrfThresholdXlm) {
      return JobPriority.HIGH;
    }

    return JobPriority.NORMAL;
  }
}
