import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Inject, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { VrfAuditRecord, CreateCommitParams, UpdateRevealParams, RecordSubmissionParams, OracleDivergenceRecord, AuditStatus, AuditChainAnchor, ChainVerificationResult } from './audit.types';
import { SUPABASE_CLIENT } from './supabase.provider';

@Injectable()
export class AuditLogService {
  /**
   * Records an oracle divergence event when consensus was not reached.
   */
  public async recordDivergence(record: OracleDivergenceRecord): Promise<void> {
    this.logger.warn(
      `Oracle divergence recorded for request ${record.requestId} (raffle ${record.raffleId ?? 'N/A'}): ${record.totalResponses} responses, threshold ${record.consensusThreshold}`,
      JSON.stringify(record),
    );
  }

  constructor(
    private readonly logger: OracleLoggerService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Computes SHA-256 hex digest of secret || nonce || seed || proof.
   */
  public computeRevealHash(
    secret: string,
    nonce: string,
    seed: string,
    proof: string,
  ): string {
    return crypto
      .createHash('sha256')
      .update(secret + nonce + seed + proof)
      .digest('hex');
  }

  /**
   * Computes SHA-256 hex digest over the canonical field concatenation in order:
   * raffle_id, commitment_hash, reveal_hash, proof, seed,
   * oracle_public_key, status, committed_at, previousChainHash
   */
  public computeChainHash(
    record: Partial<VrfAuditRecord>,
    previousChainHash: string,
  ): string {
    const parts = [
      String(record.raffle_id ?? ''),
      record.commitment_hash ?? '',
      record.reveal_hash ?? '',
      record.proof ?? '',
      record.seed ?? '',
      record.oracle_public_key ?? '',
      record.status ?? '',
      record.committed_at ?? '',
      previousChainHash,
    ];

    return crypto
      .createHash('sha256')
      .update(parts.join(''))
      .digest('hex');
  }

  /**
   * Returns the chain_hash of the record with the largest id less than beforeId,
   * or the largest id overall if beforeId is undefined.
   * Returns "GENESIS" if no such record exists.
   */
  private async getPreviousChainHash(beforeId?: number): Promise<string> {
    let query = this.supabase
      .from('vrf_audit_log')
      .select('chain_hash')
      .order('id', { ascending: false })
      .limit(1);

    if (beforeId !== undefined) {
      query = query.lt('id', beforeId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch previous chain hash: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return 'GENESIS';
    }

    return data[0].chain_hash as string;
  }

  /**
   * Records a successful randomness submission to the contract.
   * This creates or updates an audit log entry with the full VRF proof, raffle ID,
   * transaction hash, ledger, oracle address, and timestamp.
   * 
   * This method ensures audit records are written even if subsequent steps fail.
   */
  public async record(params: RecordSubmissionParams): Promise<void> {
    try {
      // Check if a record already exists for this raffle
      const { data: existing } = await this.supabase
        .from('vrf_audit_log')
        .select('id, committed_at, commitment_hash')
        .eq('raffle_id', params.raffleId)
        .single();

      if (existing) {
        // Update existing record with submission details
        const previousChainHash = await this.getPreviousChainHash(existing.id);
        
        const record: Partial<VrfAuditRecord> = {
          raffle_id: params.raffleId,
          commitment_hash: existing.commitment_hash,
          oracle_public_key: params.oracleAddress,
          status: 'revealed',
          committed_at: existing.committed_at,
          reveal_hash: '', // Will be computed if we have the secret components
          proof: params.vrfProof,
          seed: '',
        };
        
        const chainHash = this.computeChainHash(record, previousChainHash);

        const { error } = await this.supabase
          .from('vrf_audit_log')
          .update({
            request_id: params.requestId || null,
            proof: params.vrfProof,
            tx_hash: params.txHash,
            ledger_sequence: params.ledger,
            oracle_public_key: params.oracleAddress,
            revealed_at: params.timestamp.toISOString(),
            status: 'revealed',
            chain_hash: chainHash,
          })
          .eq('raffle_id', params.raffleId);

        if (error) {
          throw new Error(`Failed to update audit record: ${error.message}`);
        }
      } else {
        // Create new record if none exists
        const previousChainHash = await this.getPreviousChainHash();
        
        const record: Partial<VrfAuditRecord> = {
          raffle_id: params.raffleId,
          commitment_hash: '',
          oracle_public_key: params.oracleAddress,
          status: 'revealed',
          committed_at: params.timestamp.toISOString(),
          reveal_hash: '',
          proof: params.vrfProof,
          seed: '',
        };
        
        const chainHash = this.computeChainHash(record, previousChainHash);

        const { error } = await this.supabase
          .from('vrf_audit_log')
          .insert({
            raffle_id: params.raffleId,
            request_id: params.requestId || null,
            commitment_hash: '',
            proof: params.vrfProof,
            tx_hash: params.txHash,
            ledger_sequence: params.ledger,
            oracle_public_key: params.oracleAddress,
            status: 'revealed',
            committed_at: params.timestamp.toISOString(),
            revealed_at: params.timestamp.toISOString(),
            reveal_hash: '',
            seed: '',
            chain_hash: chainHash,
          });

        if (error) {
          throw new Error(`Failed to insert audit record: ${error.message}`);
        }
      }

      this.logger.log(
        `Audit record saved for raffle ${params.raffleId}: tx=${params.txHash}, ledger=${params.ledger}`,
      );
    } catch (error) {
      // Log error but don't throw - audit logging should not break the main flow
      this.logger.error(
        `Failed to record audit log for raffle ${params.raffleId}: ${error.message}`,
      );
    }
  }

  /**
   * Inserts a new commit record into vrf_audit_log.
   */
  public async createCommitRecord(params: CreateCommitParams): Promise<void> {
    const previousChainHash = await this.getPreviousChainHash();

    const record: Partial<VrfAuditRecord> = {
      raffle_id: params.raffleId,
      commitment_hash: params.commitmentHash,
      oracle_public_key: params.oraclePublicKey,
      status: 'committed',
      committed_at: params.committedAt.toISOString(),
      reveal_hash: '',
      proof: '',
      seed: '',
    };

    const chainHash = this.computeChainHash(record, previousChainHash);

    const { error } = await this.supabase.from('vrf_audit_log').insert({
      raffle_id: record.raffle_id,
      commitment_hash: record.commitment_hash,
      oracle_public_key: record.oracle_public_key,
      status: record.status,
      committed_at: record.committed_at,
      reveal_hash: record.reveal_hash,
      proof: record.proof,
      seed: record.seed,
      chain_hash: chainHash,
    });

    if (error) {
      throw new Error(`Failed to insert commit record: ${error.message}`);
    }
  }

  /**
   * Updates an existing commit record with reveal data, or inserts a new record
   * if no prior commit record exists for the raffleId.
   */
  public async updateRevealRecord(params: UpdateRevealParams): Promise<void> {
    const revealHash = this.computeRevealHash(
      params.secret,
      params.nonce,
      params.seed,
      params.proof,
    );

    const { data, error: fetchError } = await this.supabase
      .from('vrf_audit_log')
      .select('id, committed_at, commitment_hash, oracle_public_key')
      .eq('raffle_id', params.raffleId)
      .single();

    if (fetchError || !data) {
      this.logger.warn(
        `No commit record found for raffleId ${params.raffleId}; inserting reveal-only record`,
      );

      const previousChainHash = await this.getPreviousChainHash();
      const record: Partial<VrfAuditRecord> = {
        raffle_id: params.raffleId,
        commitment_hash: '',
        oracle_public_key: '',
        status: 'revealed',
        committed_at: params.revealedAt.toISOString(),
        reveal_hash: revealHash,
        proof: params.proof,
        seed: params.seed,
      };
      const chainHash = this.computeChainHash(record, previousChainHash);

      const { error: insertError } = await this.supabase
        .from('vrf_audit_log')
        .insert({
          raffle_id: params.raffleId,
          request_id: params.requestId,
          commitment_hash: '',
          oracle_public_key: '',
          status: 'revealed',
          committed_at: params.revealedAt.toISOString(),
          reveal_hash: revealHash,
          proof: params.proof,
          seed: params.seed,
          revealed_at: params.revealedAt.toISOString(),
          ledger_sequence: params.ledgerSequence,
          chain_hash: chainHash,
        });

      if (insertError) {
        throw new Error(`Failed to insert reveal record: ${insertError.message}`);
      }
      return;
    }

    const existingRecord = data as Pick<VrfAuditRecord, 'id' | 'committed_at' | 'commitment_hash' | 'oracle_public_key'>;
    const previousChainHash = await this.getPreviousChainHash(existingRecord.id);

    const record: Partial<VrfAuditRecord> = {
      raffle_id: params.raffleId,
      commitment_hash: existingRecord.commitment_hash,
      oracle_public_key: existingRecord.oracle_public_key,
      status: 'revealed',
      committed_at: existingRecord.committed_at,
      reveal_hash: revealHash,
      proof: params.proof,
      seed: params.seed,
    };
    const chainHash = this.computeChainHash(record, previousChainHash);

    const { error: updateError } = await this.supabase
      .from('vrf_audit_log')
      .update({
        request_id: params.requestId,
        reveal_hash: revealHash,
        proof: params.proof,
        seed: params.seed,
        revealed_at: params.revealedAt.toISOString(),
        ledger_sequence: params.ledgerSequence,
        status: 'revealed',
        chain_hash: chainHash,
      })
      .eq('raffle_id', params.raffleId);

    if (updateError) {
      throw new Error(`Failed to update reveal record: ${updateError.message}`);
    }
  }

  /**
   * Fetches the audit record for a given raffleId.
   * Returns null if no record exists; throws on unexpected Supabase errors.
   */
  public async getByRaffleId(raffleId: number): Promise<VrfAuditRecord | null> {
    const { data, error } = await this.supabase
      .from('vrf_audit_log')
      .select('*')
      .eq('raffle_id', raffleId)
      .single();

    if (error) {
      // PostgREST returns code PGRST116 when no rows match .single()
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch audit record: ${error.message}`);
    }

    return data as VrfAuditRecord;
  }

  /**
   * Verifies the chain hash integrity of all records, optionally starting from fromId.
   * Returns detailed results including the location of the first broken link.
   */
  public async verifyChain(fromId?: number): Promise<ChainVerificationResult> {
    let query = this.supabase
      .from('vrf_audit_log')
      .select('*')
      .order('id', { ascending: true });

    if (fromId !== undefined) {
      query = query.gte('id', fromId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch records for chain verification: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return {
        valid: true,
        total_records: 0,
        first_broken_at: null,
        first_broken_record_id: null,
        expected_hash: null,
        stored_hash: null,
      };
    }

    const records = data as VrfAuditRecord[];

    // Determine the starting previousChainHash
    let previousChainHash: string;
    if (fromId !== undefined) {
      previousChainHash = await this.getPreviousChainHash(fromId);
    } else {
      previousChainHash = 'GENESIS';
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const expected = this.computeChainHash(record, previousChainHash);
      if (expected !== record.chain_hash) {
        return {
          valid: false,
          total_records: records.length,
          first_broken_at: i + 1,
          first_broken_record_id: record.id,
          expected_hash: expected,
          stored_hash: record.chain_hash,
        };
      }
      previousChainHash = record.chain_hash;
    }

    return {
      valid: true,
      total_records: records.length,
      first_broken_at: null,
      first_broken_record_id: null,
      expected_hash: null,
      stored_hash: null,
    };
  }

  /**
   * Returns the chain_hash of the most recent record (the chain head).
   * Returns "GENESIS" if no records exist.
   */
  public async getChainHead(): Promise<string> {
    const { data, error } = await this.supabase
      .from('vrf_audit_log')
      .select('chain_hash')
      .order('id', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to fetch chain head: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return 'GENESIS';
    }

    return data[0].chain_hash as string;
  }

  /**
   * Anchors the current chain head into the audit_chain_anchors table.
   * This creates a point-in-time snapshot that should be published externally
   * (e.g. a hash on a public bulletin, a tweet, or an on-chain memo) so that
   * retroactive modification of the entire chain becomes detectable.
   *
   * @param anchorType - Free-text label (e.g. "cli", "scheduled-cron").
   * @param externalRef - Optional URL, tx hash, or external identifier.
   */
  public async anchorChainHead(
    anchorType: string = 'cli',
    externalRef?: string,
  ): Promise<AuditChainAnchor> {
    const chainHeadHash = await this.getChainHead();

    // Count total records for provenance
    const { count, error: countError } = await this.supabase
      .from('vrf_audit_log')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Failed to count audit records: ${countError.message}`);
    }

    const { data, error } = await this.supabase
      .from('audit_chain_anchors')
      .insert({
        chain_head_hash: chainHeadHash,
        record_count: count || 0,
        anchored_at: new Date().toISOString(),
        anchor_type: anchorType,
        external_ref: externalRef || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to anchor chain head: ${error.message}`);
    }

    const anchor = data as AuditChainAnchor;

    this.logger.log(
      `Chain anchored at record #${anchor.record_count}: head=${anchor.chain_head_hash.slice(0, 16)}... (type=${anchorType})`,
    );

    return anchor;
  }

  /**
   * Returns the most recent chain anchor, or null if none exists.
   */
  public async getLatestAnchor(): Promise<AuditChainAnchor | null> {
    const { data, error } = await this.supabase
      .from('audit_chain_anchors')
      .select('*')
      .order('id', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to fetch latest anchor: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0] as AuditChainAnchor;
  }

  /**
   * Returns the full anchor history, most recent first.
   */
  public async getAnchorHistory(limit: number = 10): Promise<AuditChainAnchor[]> {
    const { data, error } = await this.supabase
      .from('audit_chain_anchors')
      .select('*')
      .order('id', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch anchor history: ${error.message}`);
    }

    return (data as AuditChainAnchor[]) || [];
  }

  /**
   * Verifies that the latest anchor's chain head hash matches the current chain head.
   * Returns null if no anchor exists.
   */
  public async verifyAnchor(): Promise<{
    matches: boolean;
    anchoredHash: string | null;
    currentHead: string;
    anchoredAt: string | null;
  } | null> {
    const latest = await this.getLatestAnchor();
    if (!latest) {
      return null;
    }

    const currentHead = await this.getChainHead();

    return {
      matches: latest.chain_head_hash === currentHead,
      anchoredHash: latest.chain_head_hash,
      currentHead,
      anchoredAt: latest.anchored_at,
    };
  }

  /**
   * Marks a raffle's audit record as abandoned.
   */
  public async markAbandoned(raffleId: number): Promise<void> {
    const { error } = await this.supabase
      .from('vrf_audit_log')
      .update({
        status: 'abandoned',
        revealed_at: new Date().toISOString(),
      })
      .eq('raffle_id', raffleId);

    if (error) {
      throw new Error(`Failed to mark record as abandoned: ${error.message}`);
    }
  }

  /**
   * Queries audit records by time range.
   * Returns records where committed_at falls within [from, to].
   */
  public async getByTimeRange(
    from: string,
    to: string,
    options: { limit?: number; offset?: number; status?: AuditStatus } = {},
  ): Promise<VrfAuditRecord[]> {
    let query = this.supabase
      .from('vrf_audit_log')
      .select('*')
      .gte('committed_at', from)
      .lte('committed_at', to)
      .order('committed_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    } else {
      query = query.limit(100);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to query audit records by time range: ${error.message}`);
    }

    return (data as VrfAuditRecord[]) || [];
  }

  /**
   * Queries audit records by status.
   */
  public async getByStatus(
    status: AuditStatus,
    options: { limit?: number; offset?: number } = {},
  ): Promise<VrfAuditRecord[]> {
    let query = this.supabase
      .from('vrf_audit_log')
      .select('*')
      .eq('status', status)
      .order('committed_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    } else {
      query = query.limit(100);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to query audit records by status: ${error.message}`);
    }

    return (data as VrfAuditRecord[]) || [];
  }

  /**
   * Returns a summary of audit records: counts by status and total.
   */
  public async getSummary(): Promise<{
    total: number;
    committed: number;
    revealed: number;
    abandoned: number;
  }> {
    const [total, committed, revealed, abandoned] = await Promise.all([
      this.supabase.from('vrf_audit_log').select('id', { count: 'exact', head: true }),
      this.supabase.from('vrf_audit_log').select('id', { count: 'exact', head: true }).eq('status', 'committed'),
      this.supabase.from('vrf_audit_log').select('id', { count: 'exact', head: true }).eq('status', 'revealed'),
      this.supabase.from('vrf_audit_log').select('id', { count: 'exact', head: true }).eq('status', 'abandoned'),
    ]);

    if (total.error) throw new Error(`Failed to get total count: ${total.error.message}`);
    if (committed.error) throw new Error(`Failed to get committed count: ${committed.error.message}`);
    if (revealed.error) throw new Error(`Failed to get revealed count: ${revealed.error.message}`);
    if (abandoned.error) throw new Error(`Failed to get abandoned count: ${abandoned.error.message}`);

    return {
      total: total.count || 0,
      committed: committed.count || 0,
      revealed: revealed.count || 0,
      abandoned: abandoned.count || 0,
    };
  }
}