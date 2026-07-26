import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface DrawRequestIdentity {
  stableRequestId: string;
  ledger: number;
  txHash: string;
  eventIndex: number;
  raffleId: number;
  contractRequestId: string;
}

export type DrawRequestClaimResult = 'claimed' | 'duplicate' | 'replayed';

@Injectable()
export class DrawRequestLedgerService {
  
  private readonly supabase?: SupabaseClient;
  private readonly inMemoryClaims = new Set<string>();

  constructor(private readonly logger: OracleLoggerService, private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    } else {
      this.logger.warn(
        'Supabase is not configured; draw request idempotency will use process-local memory.',
      );
    }
  }

  async claim(
    identity: DrawRequestIdentity,
    replayOverride: boolean,
  ): Promise<DrawRequestClaimResult> {
    if (replayOverride) {
      await this.recordReplay(identity);
      return 'replayed';
    }

    if (!this.supabase) {
      if (this.inMemoryClaims.has(identity.stableRequestId)) {
        return 'duplicate';
      }
      this.inMemoryClaims.add(identity.stableRequestId);
      return 'claimed';
    }

    const { error } = await this.supabase.from('oracle_draw_requests').insert({
      request_identity: identity.stableRequestId,
      ledger_sequence: identity.ledger,
      tx_hash: identity.txHash,
      event_index: identity.eventIndex,
      raffle_id: identity.raffleId,
      contract_request_id: identity.contractRequestId,
      replayed: false,
    });

    if (!error) {
      return 'claimed';
    }

    if (error.code === '23505') {
      return 'duplicate';
    }

    throw new Error(`Failed to claim draw request: ${error.message}`);
  }

  private async recordReplay(identity: DrawRequestIdentity): Promise<void> {
    if (!this.supabase) {
      this.inMemoryClaims.add(identity.stableRequestId);
      return;
    }

    const { error } = await this.supabase.from('oracle_draw_request_replays').insert({
      request_identity: identity.stableRequestId,
      ledger_sequence: identity.ledger,
      tx_hash: identity.txHash,
      event_index: identity.eventIndex,
      raffle_id: identity.raffleId,
      contract_request_id: identity.contractRequestId,
    });

    if (error) {
      throw new Error(`Failed to record draw request replay: ${error.message}`);
    }
  }
}
