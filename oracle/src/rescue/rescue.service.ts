import { OracleLoggerService, OracleLogFields } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { RANDOMNESS_QUEUE, RandomnessJobPayload } from '../queue/randomness.queue';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { RandomnessMethod, RandomnessResult } from '../queue/queue.types';
import { LagMonitorService } from '../health/lag-monitor.service';
import { HealthService } from '../health/health.service';
import {
  DrawRequestStatus,
  StuckDrawLedgerRange,
  StuckDrawReport,
  StuckDrawReportEntry,
  StuckDrawReportSummary,
} from './stuck-draw.types';

export {
  DrawRequestStatus,
  StuckDrawLedgerRange,
  StuckDrawReport,
  StuckDrawReportEntry,
  StuckDrawReportSummary,
} from './stuck-draw.types';

interface DrawCandidate {
  raffleId: number;
  requestId: string;
  jobId?: string;
  queueState?: string;
  failedReason?: string;
  jobTimestamp?: number;
  requestedAtLedger?: number;
  trackedAt?: Date;
  attempts?: number;
}

export interface RescueLogEntry {
  timestamp: Date;
  action: 'RE_ENQUEUE' | 'FORCE_SUBMIT' | 'FORCE_FAIL';
  raffleId: number;
  requestId: string;
  jobId?: string;
  operator: string;
  reason: string;
  result: 'SUCCESS' | 'FAILURE';
  details?: any;
}

export interface JobInfo {
  id: string;
  raffleId: number;
  requestId: string;
  attempts: number;
  failedReason?: string;
  state: string;
  timestamp: number;
}


import { RescueDetectorService } from './rescue-detector.service';
import { RescuePlannerService } from './rescue-planner.service';
import { RescueExecutorService } from './rescue-executor.service';

@Injectable()
export class RescueService {
  constructor(
    private readonly detector: RescueDetectorService,
    private readonly planner: RescuePlannerService,
    private readonly executor: RescueExecutorService,
  ) {}

  async getFailedJobs() { return this.detector.getFailedJobs(); }
  async getAllJobs() { return this.detector.getAllJobs(); }
  async getStuckDrawReport() { return this.detector.getStuckDrawReport(); }

  async getForceSubmitPreview(r, req, p) { return this.planner.getForceSubmitPreview(r, req, p); }
  async previewReEnqueueJob(j) { return this.planner.previewReEnqueueJob(j); }
  async previewForceFailJob(j) { return this.planner.previewForceFailJob(j); }

  async reEnqueueJob(j, o, r) { return this.executor.reEnqueueJob(j, o, r); }
  async forceSubmit(ra, req, o, r, p) { return this.executor.forceSubmit(ra, req, o, r, p); }
  async forceFail(j, o, r) { return this.executor.forceFail(j, o, r); }
  getRescueLogs(l) { return this.executor.getRescueLogs(l); }
  getRescueLogsByRaffle(r) { return this.executor.getRescueLogsByRaffle(r); }
}
