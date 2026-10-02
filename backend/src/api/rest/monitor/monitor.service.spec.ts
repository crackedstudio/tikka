import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { MonitorService, AuditLogEntry } from './monitor.service';

function createMockSupabase(initialState?: {
  jobsCount?: { count: number | null; error: any | null };
  jobsData?: { data: any[] | null; error: any | null };
  statsData?: { data: any[] | null; error: any | null };
  latencyData?: { data: any[] | null; error: any | null };
  errorsData?: { data: any[] | null; error: any | null };
  auditInsert?: { error: any | null };
  auditData?: { data: any[] | null; error: any | null };
}) {
  const insertCalls: any[] = [];
  const queryLog: { table: string; method: string; args: any[] }[] = [];

  const mockBuilder = (table: string) => {
    let isCountQuery = false;
    const builder: any = {
      select: jest.fn().mockImplementation((fields: string, opts?: any) => {
        queryLog.push({ table, method: 'select', args: [fields, opts] });
        if (opts?.count === 'exact' && opts?.head === true) {
          isCountQuery = true;
        }
        return builder;
      }),
      eq: jest.fn().mockImplementation((col: string, val: any) => {
        queryLog.push({ table, method: 'eq', args: [col, val] });
        return builder;
      }),
      not: jest.fn().mockImplementation((col: string, op: string, val: any) => {
        queryLog.push({ table, method: 'not', args: [col, op, val] });
        return builder;
      }),
      gt: jest.fn().mockImplementation((col: string, val: any) => {
        queryLog.push({ table, method: 'gt', args: [col, val] });
        return builder;
      }),
      gte: jest.fn().mockImplementation((col: string, val: any) => {
        queryLog.push({ table, method: 'gte', args: [col, val] });
        return builder;
      }),
      lte: jest.fn().mockImplementation((col: string, val: any) => {
        queryLog.push({ table, method: 'lte', args: [col, val] });
        return builder;
      }),
      order: jest.fn().mockImplementation((col: string, opts?: any) => {
        queryLog.push({ table, method: 'order', args: [col, opts] });
        return builder;
      }),
      limit: jest.fn().mockImplementation((n: number) => {
        queryLog.push({ table, method: 'limit', args: [n] });
        return builder;
      }),
      insert: jest.fn().mockImplementation((records: any[]) => {
        insertCalls.push(records);
        queryLog.push({ table, method: 'insert', args: [records] });
        const res = initialState?.auditInsert ?? { error: null };
        return Promise.resolve(res);
      }),
      then: (resolve: (val: any) => void, reject?: (err: any) => void) => {
        if (table === 'oracle_jobs') {
          if (isCountQuery) {
            countQueryCount++;
            const res = initialState?.jobsCount ?? { count: 0, error: null };
            return Promise.resolve(res).then(resolve, reject);
          }
          dataQueryCount++;
          if (initialState?.jobsData) {
            return Promise.resolve(initialState.jobsData).then(resolve, reject);
          }
          if (initialState?.statsData) {
            return Promise.resolve(initialState.statsData).then(resolve, reject);
          }
          if (initialState?.latencyData) {
            return Promise.resolve(initialState.latencyData).then(resolve, reject);
          }
          if (initialState?.errorsData) {
            return Promise.resolve(initialState.errorsData).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        }

        if (table === 'audit_logs') {
          if (initialState?.auditData) {
            return Promise.resolve(initialState.auditData).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        }

        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return builder;
  };

  const client = {
    from: jest.fn().mockImplementation((table: string) => mockBuilder(table)),
    _queryLog: queryLog,
    _insertCalls: insertCalls,
  };

  return client;
}

describe('MonitorService', () => {
  describe('getJobs', () => {
    it('returns paginated jobs with default limit and maps fields correctly', async () => {
      const mockRows = [
        {
          id: 1,
          status: 'completed',
          enqueued_at: '2026-09-25T10:00:00Z',
          updated_at: '2026-09-25T10:00:05Z',
          confirmed_at: '2026-09-25T10:00:05Z',
          latency_ms: 5000,
          xdr: 'AAAA...',
          error_message: null,
        },
      ];

      const supabase = createMockSupabase({
        jobsCount: { count: 1, error: null },
        jobsData: { data: mockRows, error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      const result = await service.getJobs({});

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        id: '1',
        status: 'completed',
        enqueuedAt: '2026-09-25T10:00:00Z',
        updatedAt: '2026-09-25T10:00:05Z',
        confirmedAt: '2026-09-25T10:00:05Z',
        latencyMs: 5000,
        xdr: 'AAAA...',
        errorMessage: undefined,
      });
      expect(result.nextCursor).toBeNull();
    });

    it('filters by status when provided in query', async () => {
      const supabase = createMockSupabase({
        jobsCount: { count: 3, error: null },
        jobsData: { data: [], error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await service.getJobs({ status: 'failed' });

      const eqCalls = supabase._queryLog.filter(
        (q) => q.method === 'eq' && q.args[0] === 'status' && q.args[1] === 'failed',
      );
      expect(eqCalls.length).toBe(2); // once for count query, once for data query
    });

    it('decodes base64 cursor and applies gt filter on id', async () => {
      const cursor = Buffer.from('42').toString('base64');
      const supabase = createMockSupabase({
        jobsCount: { count: 10, error: null },
        jobsData: { data: [], error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await service.getJobs({ cursor });

      const gtCalls = supabase._queryLog.filter(
        (q) => q.method === 'gt' && q.args[0] === 'id' && q.args[1] === '42',
      );
      expect(gtCalls).toHaveLength(1);
    });

    it('computes nextCursor when more rows than limit are returned', async () => {
      const limit = 2;
      const mockRows = [
        { id: 10, status: 'pending', enqueued_at: 't1', updated_at: 't1' },
        { id: 11, status: 'pending', enqueued_at: 't2', updated_at: 't2' },
        { id: 12, status: 'pending', enqueued_at: 't3', updated_at: 't3' }, // extra row indicates hasMore
      ];

      const supabase = createMockSupabase({
        jobsCount: { count: 10, error: null },
        jobsData: { data: mockRows, error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      const result = await service.getJobs({ limit });

      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBe(Buffer.from('11').toString('base64'));
    });

    it('throws ServiceUnavailableException on count query failure', async () => {
      const supabase = createMockSupabase({
        jobsCount: { count: null, error: new Error('DB Connection Timeout') },
        jobsData: { data: [], error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await expect(service.getJobs({})).rejects.toThrow(ServiceUnavailableException);
      await expect(service.getJobs({})).rejects.toThrow('Failed to fetch jobs');
    });

    it('throws ServiceUnavailableException on data query failure', async () => {
      const supabase = createMockSupabase({
        jobsCount: { count: 5, error: null },
        jobsData: { data: null, error: new Error('Query error') },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await expect(service.getJobs({})).rejects.toThrow(ServiceUnavailableException);
    });

    it('rethrows BadRequestException if thrown', async () => {
      const supabase = {
        from: jest.fn().mockImplementation(() => {
          throw new BadRequestException('Bad query parameter');
        }),
      };

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await expect(service.getJobs({})).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStats', () => {
    it('aggregates pending, completed, and failed jobs correctly', async () => {
      const rows = [
        { status: 'pending' },
        { status: 'pending' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'failed' },
        { status: 'unknown' }, // uncounted status
      ];

      const supabase = createMockSupabase({
        statsData: { data: rows, error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      const stats = await service.getStats();

      expect(stats.pending).toBe(2);
      expect(stats.completed).toBe(3);
      expect(stats.failed).toBe(1);
      expect(typeof stats.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(stats.timestamp))).toBe(false);
    });

    it('handles empty job records returning zero counts', async () => {
      const supabase = createMockSupabase({
        statsData: { data: [], error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      const stats = await service.getStats();

      expect(stats.pending).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('throws ServiceUnavailableException on query error', async () => {
      const supabase = createMockSupabase({
        statsData: { data: null, error: new Error('Table unreachable') },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await expect(service.getStats()).rejects.toThrow(ServiceUnavailableException);
      await expect(service.getStats()).rejects.toThrow('Failed to fetch stats');
    });
  });

  describe('getLatency', () => {
    it('validates date range: throws BadRequestException if from > to', async () => {
      const supabase = createMockSupabase();
      const service = new MonitorService(supabase as unknown as SupabaseClient);

      await expect(
        service.getLatency({
          from: '2026-09-25T12:00:00Z',
          to: '2026-09-25T10:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getLatency({
          from: '2026-09-25T12:00:00Z',
          to: '2026-09-25T10:00:00Z',
        }),
      ).rejects.toThrow('from must be before to');
    });

    it('calculates latency correctly from enqueued_at and confirmed_at', async () => {
      const rows = [
        {
          id: 101,
          enqueued_at: '2026-09-25T10:00:00.000Z',
          confirmed_at: '2026-09-25T10:00:03.500Z',
        },
      ];

      const supabase = createMockSupabase({
        latencyData: { data: rows, error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      const points = await service.getLatency({
        from: '2026-09-25T09:00:00.000Z',
        to: '2026-09-25T11:00:00.000Z',
      });

      expect(points).toHaveLength(1);
      expect(points[0]).toEqual({
        jobId: '101',
        enqueuedAt: '2026-09-25T10:00:00.000Z',
        confirmedAt: '2026-09-25T10:00:03.500Z',
        latencyMs: 3500,
      });

      // Verify filters applied
      const gteCall = supabase._queryLog.find((q) => q.method === 'gte');
      const lteCall = supabase._queryLog.find((q) => q.method === 'lte');
      expect(gteCall).toBeDefined();
      expect(lteCall).toBeDefined();
    });

    it('defaults to 24h window when neither from nor to are provided', async () => {
      const supabase = createMockSupabase({
        latencyData: { data: [], error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await service.getLatency({});

      const gteCall = supabase._queryLog.find((q) => q.method === 'gte');
      const lteCall = supabase._queryLog.find((q) => q.method === 'lte');
      expect(gteCall).toBeDefined();
      expect(lteCall).toBeDefined();
    });

    it('throws ServiceUnavailableException on database error', async () => {
      const supabase = createMockSupabase({
        latencyData: { data: null, error: new Error('DB Error') },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await expect(service.getLatency({})).rejects.toThrow(ServiceUnavailableException);
      await expect(service.getLatency({})).rejects.toThrow('Failed to fetch latency data');
    });
  });

  describe('getErrors', () => {
    it('returns error records with default limit and fallbacks for null values', async () => {
      const rows = [
        {
          id: 500,
          updated_at: '2026-09-25T11:00:00Z',
          error_message: 'Simulation failed: insufficient balance',
          xdr: 'AAAAXDR',
        },
        {
          id: 501,
          updated_at: '2026-09-25T11:05:00Z',
          error_message: null,
          xdr: null,
        },
      ];

      const supabase = createMockSupabase({
        errorsData: { data: rows, error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      const errors = await service.getErrors({});

      expect(errors).toHaveLength(2);
      expect(errors[0]).toEqual({
        jobId: '500',
        failedAt: '2026-09-25T11:00:00Z',
        errorMessage: 'Simulation failed: insufficient balance',
        xdr: 'AAAAXDR',
      });
      expect(errors[1]).toEqual({
        jobId: '501',
        failedAt: '2026-09-25T11:05:00Z',
        errorMessage: '',
        xdr: '',
      });

      const limitCall = supabase._queryLog.find((q) => q.method === 'limit');
      expect(limitCall?.args[0]).toBe(50);
    });

    it('uses custom limit when specified', async () => {
      const supabase = createMockSupabase({
        errorsData: { data: [], error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await service.getErrors({ limit: 10 });

      const limitCall = supabase._queryLog.find((q) => q.method === 'limit');
      expect(limitCall?.args[0]).toBe(10);
    });

    it('throws ServiceUnavailableException on database error', async () => {
      const supabase = createMockSupabase({
        errorsData: { data: null, error: new Error('DB connection failed') },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await expect(service.getErrors({})).rejects.toThrow(ServiceUnavailableException);
      await expect(service.getErrors({})).rejects.toThrow('Failed to fetch errors');
    });
  });

  describe('logAudit', () => {
    it('persists audit log entry into audit_logs table with snake_case mapping', async () => {
      const supabase = createMockSupabase({
        auditInsert: { error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      const entry: AuditLogEntry = {
        adminId: 'admin-123',
        route: '/admin/replay',
        method: 'POST',
        statusCode: 202,
        timestamp: '2026-09-25T12:00:00Z',
      };

      await service.logAudit(entry);

      expect(supabase._insertCalls).toHaveLength(1);
      expect(supabase._insertCalls[0]).toEqual([
        {
          admin_id: 'admin-123',
          route: '/admin/replay',
          method: 'POST',
          status_code: 202,
          timestamp: '2026-09-25T12:00:00Z',
        },
      ]);
    });

    it('throws ServiceUnavailableException when insertion returns an error', async () => {
      const supabase = createMockSupabase({
        auditInsert: { error: new Error('Insert rejected') },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      const entry: AuditLogEntry = {
        adminId: 'admin-123',
        route: '/admin/replay',
        method: 'POST',
        statusCode: 202,
        timestamp: '2026-09-25T12:00:00Z',
      };

      await expect(service.logAudit(entry)).rejects.toThrow(ServiceUnavailableException);
      await expect(service.logAudit(entry)).rejects.toThrow('Failed to persist audit log');
    });
  });

  describe('getAuditLogs', () => {
    it('returns audit log entries with default limit and defaults unknown-admin', async () => {
      const rows = [
        {
          admin_id: 'admin-alice',
          route: '/monitor/stats',
          method: 'GET',
          status_code: 200,
          timestamp: '2026-09-25T12:00:00Z',
        },
        {
          admin_id: null,
          route: '/admin/replay',
          method: 'POST',
          status_code: 401,
          timestamp: '2026-09-25T11:59:00Z',
        },
      ];

      const supabase = createMockSupabase({
        auditData: { data: rows, error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      const result = await service.getAuditLogs({});

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        adminId: 'admin-alice',
        route: '/monitor/stats',
        method: 'GET',
        statusCode: 200,
        timestamp: '2026-09-25T12:00:00Z',
      });
      expect(result[1]).toEqual({
        adminId: 'unknown-admin',
        route: '/admin/replay',
        method: 'POST',
        statusCode: 401,
        timestamp: '2026-09-25T11:59:00Z',
      });

      const limitCall = supabase._queryLog.find((q) => q.method === 'limit');
      expect(limitCall?.args[0]).toBe(200);
    });

    it('applies date filtering from and to when provided', async () => {
      const supabase = createMockSupabase({
        auditData: { data: [], error: null },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await service.getAuditLogs({
        from: '2026-09-25T00:00:00Z',
        to: '2026-09-25T23:59:59Z',
        limit: 50,
      });

      const gteCall = supabase._queryLog.find((q) => q.method === 'gte');
      const lteCall = supabase._queryLog.find((q) => q.method === 'lte');
      const limitCall = supabase._queryLog.find((q) => q.method === 'limit');

      expect(gteCall?.args).toEqual(['timestamp', '2026-09-25T00:00:00Z']);
      expect(lteCall?.args).toEqual(['timestamp', '2026-09-25T23:59:59Z']);
      expect(limitCall?.args[0]).toBe(50);
    });

    it('throws ServiceUnavailableException on query error', async () => {
      const supabase = createMockSupabase({
        auditData: { data: null, error: new Error('Permission denied') },
      });

      const service = new MonitorService(supabase as unknown as SupabaseClient);
      await expect(service.getAuditLogs({})).rejects.toThrow(ServiceUnavailableException);
      await expect(service.getAuditLogs({})).rejects.toThrow('Failed to fetch audit logs');
    });
  });
});
