import { Injectable, Inject, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  raffle_id: number;
  request_id: string;
  oracle_id: string;
  seed: string;
  proof: string;
  tx_hash: string;
  method: 'VRF' | 'PRNG';
  created_at: string;
}

export interface AuditLogFilters {
  raffle_id?: number;
  limit?: number;
  offset?: number;
}

export interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async getEntries(filters: AuditLogFilters = {}): Promise<AuditLogResponse> {
    const { raffle_id, limit = 50, offset = 0 } = filters;

    let query = this.supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (raffle_id !== undefined) {
      query = query.eq('raffle_id', raffle_id);
    }

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to fetch audit log: ${error.message}`);
      throw new Error(error.message);
    }

    return { entries: (data as AuditLogEntry[]) ?? [], total: count ?? 0 };
  }

  async getEntryByRequestId(requestId: string): Promise<AuditLogEntry | null> {
    const { data, error } = await this.supabase
      .from('audit_log')
      .select('*')
      .eq('request_id', requestId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      this.logger.error(`Failed to fetch audit entry: ${error.message}`);
      throw new Error(error.message);
    }

    return data as AuditLogEntry;
  }
}
