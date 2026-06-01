import { Injectable, Inject, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';
import {
  buildProofMetadata,
  toStoredRequestInput,
} from './audit-redaction';
import {
  CompleteRandomnessAuditParams,
  CreateRandomnessAuditParams,
  FailRandomnessAuditParams,
  RandomnessAuditRecord,
  RandomnessAuditTrace,
  RandomnessAuditTraceStep,
  RandomnessProofMetadata,
  RandomnessRequestInput,
} from './randomness-audit.types';

@Injectable()
export class RandomnessAuditService {
  private readonly logger = new Logger(RandomnessAuditService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Records the contract event / queue enqueue phase before randomness is computed.
   */
  /**
   * Creates a pending record or returns the existing one (idempotent for retries).
   */
  async ensurePending(params: CreateRandomnessAuditParams): Promise<RandomnessAuditRecord> {
    const existing = await this.getByRequestId(params.requestInput.requestId);
    if (existing) {
      return existing;
    }
    return this.createPending(params);
  }

  async createPending(params: CreateRandomnessAuditParams): Promise<RandomnessAuditRecord> {
    const input = toStoredRequestInput(params.requestInput);
    const contractEventId =
      params.contractEventId ?? input.stableRequestId ?? null;

    const row = {
      request_id: input.requestId,
      stable_request_id: input.stableRequestId ?? null,
      contract_event_id: contractEventId,
      queue_job_id: params.queueJobId ?? null,
      raffle_id: input.raffleId,
      request_input: input,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('randomness_audit_log')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create randomness audit record: ${error.message}`);
    }

    return data as RandomnessAuditRecord;
  }

  /**
   * Marks a successful randomness decision with provider output and submission tx.
   */
  async markSucceeded(params: CompleteRandomnessAuditParams): Promise<RandomnessAuditRecord> {
    const proofMetadata = buildProofMetadata(params.seed, params.proof);
    const completedAt = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('randomness_audit_log')
      .update({
        provider: params.provider,
        proof_metadata: proofMetadata,
        submission_tx_hash: params.submissionTxHash,
        submission_ledger: params.submissionLedger ?? null,
        status: 'succeeded',
        error_message: null,
        completed_at: completedAt,
      })
      .eq('request_id', params.requestId)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to mark randomness audit succeeded: ${error.message}`);
    }

    return data as RandomnessAuditRecord;
  }

  /**
   * Marks a failed randomness decision; optional partial proof metadata is stored when present.
   */
  /**
   * Records a draw that was already fulfilled on-chain before this oracle run processed it.
   */
  async markAlreadySubmitted(requestId: string): Promise<RandomnessAuditRecord> {
    const completedAt = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('randomness_audit_log')
      .update({
        status: 'succeeded',
        error_message: null,
        completed_at: completedAt,
      })
      .eq('request_id', requestId)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to mark randomness audit already submitted: ${error.message}`);
    }

    return data as RandomnessAuditRecord;
  }

  async markFailed(params: FailRandomnessAuditParams): Promise<RandomnessAuditRecord> {
    const proofMetadata =
      params.seed && params.proof
        ? buildProofMetadata(params.seed, params.proof)
        : null;

    const completedAt = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('randomness_audit_log')
      .update({
        provider: params.provider ?? null,
        proof_metadata: proofMetadata,
        status: 'failed',
        error_message: params.errorMessage,
        completed_at: completedAt,
      })
      .eq('request_id', params.requestId)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to mark randomness audit failed: ${error.message}`);
    }

    return data as RandomnessAuditRecord;
  }

  async getByRequestId(requestId: string): Promise<RandomnessAuditRecord | null> {
    const { data, error } = await this.supabase
      .from('randomness_audit_log')
      .select('*')
      .eq('request_id', requestId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch randomness audit record: ${error.message}`);
    }

    return data as RandomnessAuditRecord;
  }

  /**
   * Builds an ordered trace from contract event through queue job to submission.
   */
  buildTrace(record: RandomnessAuditRecord): RandomnessAuditTrace {
    const timeline: RandomnessAuditTraceStep[] = [];

    if (record.contract_event_id) {
      timeline.push({
        phase: 'contract_event',
        at: record.created_at,
        detail: {
          contractEventId: record.contract_event_id,
          stableRequestId: record.stable_request_id,
          raffleId: record.raffle_id,
          requestId: record.request_id,
        },
      });
    }

    if (record.queue_job_id) {
      timeline.push({
        phase: 'queue_job',
        at: record.created_at,
        detail: {
          queueJobId: record.queue_job_id,
          requestId: record.request_id,
        },
      });
    }

    if (record.provider && record.proof_metadata) {
      timeline.push({
        phase: 'decision',
        at: record.completed_at ?? record.created_at,
        detail: {
          provider: record.provider,
          proofMetadata: this.publicProofMetadata(record.proof_metadata),
        },
      });
    }

    if (record.submission_tx_hash) {
      timeline.push({
        phase: 'submission',
        at: record.completed_at ?? record.created_at,
        detail: {
          submissionTxHash: record.submission_tx_hash,
          submissionLedger: record.submission_ledger,
          status: record.status,
        },
      });
    } else if (record.status === 'succeeded') {
      timeline.push({
        phase: 'submission',
        at: record.completed_at ?? record.created_at,
        detail: {
          status: record.status,
          note: 'Already submitted on-chain before oracle processing',
        },
      });
    } else if (record.status === 'failed') {
      timeline.push({
        phase: 'submission',
        at: record.completed_at ?? record.created_at,
        detail: {
          status: record.status,
          errorMessage: record.error_message,
        },
      });
    }

    return {
      requestId: record.request_id,
      stableRequestId: record.stable_request_id,
      contractEventId: record.contract_event_id,
      queueJobId: record.queue_job_id,
      raffleId: record.raffle_id,
      requestInput: record.request_input,
      provider: record.provider,
      proofMetadata: record.proof_metadata
        ? this.publicProofMetadata(record.proof_metadata)
        : null,
      submissionTxHash: record.submission_tx_hash,
      submissionLedger: record.submission_ledger,
      status: record.status,
      errorMessage: record.error_message,
      createdAt: record.created_at,
      completedAt: record.completed_at,
      timeline,
    };
  }

  async getTraceByRequestId(requestId: string): Promise<RandomnessAuditTrace | null> {
    const record = await this.getByRequestId(requestId);
    if (!record) {
      return null;
    }
    return this.buildTrace(record);
  }

  private publicProofMetadata(
    metadata: RandomnessProofMetadata,
  ): RandomnessProofMetadata {
    return {
      seed: metadata.seed,
      proof: metadata.proof,
      seedLength: metadata.seedLength,
      proofLength: metadata.proofLength,
      seedDigest: metadata.seedDigest,
      proofDigest: metadata.proofDigest,
    };
  }
}
