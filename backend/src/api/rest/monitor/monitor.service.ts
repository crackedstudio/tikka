import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../services/supabase.provider';
import {
  ErrorRecord,
  LatencyPoint,
  OracleJob,
  PaginatedJobsResponse,
  QueueStatsResponse,
} from './monitor.types';
import { JobsQueryDto } from './dto/jobs-query.dto';
import { LatencyQueryDto } from './dto/latency-query.dto';
import { ErrorsQueryDto } from './dto/errors-query.dto';

@Injectable()
export class MonitorService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async getJobs(query: JobsQueryDto): Promise<PaginatedJobsResponse> {
    const limit = query.limit ?? 50;

    try {
      // Build count query
      let countQuery = this.supabase
        .from('oracle_jobs')
        .select('*', { count: 'exact', head: true });

      if (query.status) {
        countQuery = countQuery.eq('status', query.status);
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      // Build data query
      let dataQuery = this.supabase
        .from('oracle_jobs')
        .select('id, status, enqueued_at, updated_at, confirmed_at, latency_ms, xdr, error_message')
        .order('id', { ascending: true })
        .limit(limit + 1);

      if (query.status) {
        dataQuery = dataQuery.eq('status', query.status);
      }

      if (query.cursor) {
        const lastId = Buffer.from(query.cursor, 'base64').toString('utf8');
        dataQuery = dataQuery.gt('id', lastId);
      }

      const { data, error } = await dataQuery;
      if (error) throw error;

      const rows = data ?? [];
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;

      const nextCursor = hasMore
        ? Buffer.from(String(pageRows[pageRows.length - 1].id)).toString('base64')
        : null;

      const jobs: OracleJob[] = pageRows.map((row) => ({
        id: String(row.id),
        status: row.status,
        enqueuedAt: row.enqueued_at,
        updatedAt: row.updated_at,
        confirmedAt: row.confirmed_at ?? undefined,
        latencyMs: row.latency_ms ?? undefined,
        xdr: row.xdr ?? undefined,
        errorMessage: row.error_message ?? undefined,
      }));

      return { data: jobs, total: count ?? 0, nextCursor };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new ServiceUnavailableException('Failed to fetch jobs');
    }
  }

  async getStats(): Promise<QueueStatsResponse> {
    try {
      const { data, error } = await this.supabase
        .from('oracle_jobs')
        .select('status');

      if (error) throw error;

      const rows = data ?? [];
      const stats = { pending: 0, completed: 0, failed: 0 };
      for (const row of rows) {
        if (row.status === 'pending') stats.pending++;
        else if (row.status === 'completed') stats.completed++;
        else if (row.status === 'failed') stats.failed++;
      }

      return { ...stats, timestamp: new Date().toISOString() };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new ServiceUnavailableException('Failed to fetch stats');
    }
  }

  async getLatency(query: LatencyQueryDto): Promise<LatencyPoint[]> {
    const now = new Date();
    let from = query.from;
    let to = query.to;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException('from must be before to');
    }

    if (!from && !to) {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      from = yesterday.toISOString();
      to = now.toISOString();
    }

    try {
      let q = this.supabase
        .from('oracle_jobs')
        .select('id, enqueued_at, confirmed_at')
        .eq('status', 'completed')
        .not('confirmed_at', 'is', null);

      if (from) q = q.gte('enqueued_at', from);
      if (to) q = q.lte('enqueued_at', to);

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((row) => ({
        jobId: String(row.id),
        enqueuedAt: row.enqueued_at,
        confirmedAt: row.confirmed_at,
        latencyMs: new Date(row.confirmed_at).getTime() - new Date(row.enqueued_at).getTime(),
      }));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new ServiceUnavailableException('Failed to fetch latency data');
    }
  }

  async getErrors(query: ErrorsQueryDto): Promise<ErrorRecord[]> {
    const limit = query.limit ?? 50;

    try {
      const { data, error } = await this.supabase
        .from('oracle_jobs')
        .select('id, updated_at, error_message, xdr')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data ?? []).map((row) => ({
        jobId: String(row.id),
        failedAt: row.updated_at,
        errorMessage: row.error_message ?? '',
        xdr: row.xdr ?? '',
      }));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new ServiceUnavailableException('Failed to fetch errors');
    }
  }
}
