import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import { SUPABASE_CLIENT } from '../services/supabase.provider';
import { Job } from 'bullmq';
import { WebhookDeliveryJobData } from './webhook-delivery.constants';

describe('WebhookDeliveryWorker', () => {
  let worker: WebhookDeliveryWorker;
  let mockSupabaseClient: any;

  const mockJobData: WebhookDeliveryJobData = {
    webhookId: 'webhook-test-id',
    targetUrl: 'https://example.com/webhook',
    secret: 'test-secret',
    eventType: 'test.event',
    payload: { test: 'data' },
    ownerAddress: 'GTEST123',
  };

  function createMockJob(overrides?: Partial<Job<WebhookDeliveryJobData>>): Job<WebhookDeliveryJobData> {
    return {
      data: mockJobData,
      id: 'job-1',
      attemptsMade: 1,
      opts: { attempts: 10 },
      ...overrides,
    } as unknown as Job<WebhookDeliveryJobData>;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = jest.fn();

    mockSupabaseClient = {
      from: jest.fn(),
      rpc: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryWorker,
        { provide: SUPABASE_CLIENT, useValue: mockSupabaseClient },
      ],
    }).compile();

    worker = module.get<WebhookDeliveryWorker>(WebhookDeliveryWorker);

    jest.spyOn(Logger.prototype, 'warn');
    jest.spyOn(Logger.prototype, 'error');
    jest.spyOn(Logger.prototype, 'debug');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('process', () => {
    it('should succeed and reset failure count on 200', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('OK'),
      } as any);

      const mockUpdate = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: mockUpdate,
        eq: mockEq,
      });

      await worker.process(createMockJob());

      expect(mockUpdate).toHaveBeenCalledWith({ failure_count: 0 });
    });

    it('should throw on non-ok response and increment failure count', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      } as any);

      mockSupabaseClient.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });
      mockSupabaseClient.rpc.mockResolvedValue({ error: null });

      await expect(worker.process(createMockJob())).rejects.toThrow('HTTP 500');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'increment_webhook_failure_count',
        { p_webhook_id: mockJobData.webhookId, p_max_failures: 5 },
      );
    });

    it('should throw on network error and increment failure count', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      mockSupabaseClient.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });
      mockSupabaseClient.rpc.mockResolvedValue({ error: null });

      await expect(worker.process(createMockJob())).rejects.toThrow('ECONNREFUSED');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'increment_webhook_failure_count',
        { p_webhook_id: mockJobData.webhookId, p_max_failures: 5 },
      );
    });

    it('should log delivery with correct parameters', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('OK'),
      } as any);

      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({
        insert: insertMock,
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      await worker.process(createMockJob());

      expect(insertMock).toHaveBeenCalledWith({
        webhook_id: mockJobData.webhookId,
        event_type: mockJobData.eventType,
        payload: mockJobData.payload,
        status_code: 200,
        response_body: 'OK',
        error_message: null,
        success: true,
      });
    });
  });

  describe('onFailed', () => {
    it('should write dead letter when attempts are exhausted', async () => {
      const job = createMockJob({ attemptsMade: 10 });

      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({ insert: insertMock });

      await worker.onFailed(job, new Error('HTTP 500'));

      expect(insertMock).toHaveBeenCalledWith({
        webhook_id: mockJobData.webhookId,
        target_url: mockJobData.targetUrl,
        event_type: mockJobData.eventType,
        payload: mockJobData.payload,
        error_message: 'HTTP 500',
        attempts_count: 10,
        last_attempt_at: expect.any(String),
      });
    });

    it('should NOT write dead letter when attempts are not exhausted', async () => {
      const job = createMockJob({ attemptsMade: 3 });

      const insertMock = jest.fn();
      mockSupabaseClient.from.mockReturnValue({ insert: insertMock });

      await worker.onFailed(job, new Error('HTTP 500'));

      expect(insertMock).not.toHaveBeenCalled();
    });

    it('should log error if dead letter insert fails', async () => {
      const job = createMockJob({ attemptsMade: 10 });

      const insertMock = jest.fn().mockRejectedValue(new Error('DB connection lost'));
      mockSupabaseClient.from.mockReturnValue({ insert: insertMock });

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await worker.onFailed(job, new Error('HTTP 500'));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to record dead letter'),
        expect.anything(),
      );
    });
  });

  describe('onApplicationShutdown', () => {
    it('should call worker.close() to drain in-flight jobs', async () => {
      const closeMock = jest.fn().mockResolvedValue(undefined);
      // WorkerHost stores the BullMQ worker on a protected property
      (worker as any).worker = { close: closeMock };

      await worker.onApplicationShutdown();

      expect(closeMock).toHaveBeenCalledTimes(1);
    });

    it('should not throw if worker is not yet initialised', async () => {
      // Simulate shutdown before the worker property is assigned
      (worker as any).worker = undefined;

      await expect(worker.onApplicationShutdown()).resolves.toBeUndefined();
    });
  });
});
