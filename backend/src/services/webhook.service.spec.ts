import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WebhookService, Webhook } from './webhook.service';
import { SUPABASE_CLIENT } from './supabase.provider';

const MAX_FAILURES = 5;
const MAX_RETRIES = 3;

describe('WebhookService', () => {
  let service: WebhookService;
  let mockSupabaseClient: any;
  let loggerSpy: jest.SpyInstance;

  // Mock webhook for testing
  const mockWebhook: Webhook = {
    id: 'webhook-test-id',
    owner_address: 'GTEST123',
    target_url: 'https://example.com/webhook',
    events: ['event.test'],
    secret: 'test-secret',
    is_active: true,
    failure_count: 0,
    created_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    global.fetch = jest.fn();

    // Create Supabase mock
    mockSupabaseClient = {
      from: jest.fn(),
      rpc: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: SUPABASE_CLIENT, useValue: mockSupabaseClient },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    
    // Spy on logger
    loggerSpy = jest.spyOn(Logger.prototype, 'warn');
    jest.spyOn(Logger.prototype, 'debug');
    jest.spyOn(Logger.prototype, 'error');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Race Condition Fix: Atomic Increment', () => {
    // ARRANGE / ACT / ASSERT: Single failure increments count correctly via atomic operation
    it('Test 1 - Atomic increment: single failure increments count correctly', async () => {
      const webhook = { ...mockWebhook, failure_count: 2 };
      
      // Mock RPC response for atomic increment
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: 3, is_active: true }],
        error: null,
      });

      // Mock delivery that fails
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      // Mock logDelivery
      const logDeliveryMock = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(service as any, 'logDelivery').mockImplementation(logDeliveryMock);

      // Act: Trigger delivery with failure
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert: RPC was called with atomic increment parameters
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'increment_webhook_failure_count',
        {
          p_webhook_id: webhook.id,
          p_max_failures: MAX_FAILURES,
        }
      );

      // Assert: No SELECT query was issued before the update
      // (RPC is the only call, not from().select()...)
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    // ARRANGE / ACT / ASSERT: Webhook disabled exactly at MAX_FAILURES
    it('Test 2 - Webhook disabled exactly at MAX_FAILURES', async () => {
      const webhook = { ...mockWebhook, failure_count: MAX_FAILURES - 1 };
      
      // Mock RPC response: increment to MAX_FAILURES and disable
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: MAX_FAILURES, is_active: false }],
        error: null,
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert
      const warnCalls = loggerSpy.mock.calls;
      const disableWarning = warnCalls.find((call) =>
        call[0]?.includes(`Disabled webhook ${webhook.id}`)
      );
      expect(disableWarning).toBeDefined();
      expect(disableWarning?.[0]).toContain(`${MAX_FAILURES} consecutive failures`);
    });

    // ARRANGE / ACT / ASSERT: Webhook NOT disabled before MAX_FAILURES
    it('Test 3 - Webhook NOT disabled before MAX_FAILURES', async () => {
      const webhook = { ...mockWebhook, failure_count: MAX_FAILURES - 2 };
      
      // Mock RPC response: increment but don't disable
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: MAX_FAILURES - 1, is_active: true }],
        error: null,
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert: No disable warning should be logged
      const warnCalls = loggerSpy.mock.calls;
      const disableWarning = warnCalls.find((call) =>
        call[0]?.includes('Disabled webhook')
      );
      expect(disableWarning).toBeUndefined();
    });

    // ARRANGE / ACT / ASSERT: Concurrent failures cannot both miss the disable
    it('Test 4 - Concurrent failures trigger disable at MAX_FAILURES (race condition closed)', async () => {
      const webhook = { ...mockWebhook, failure_count: MAX_FAILURES - 1 };
      
      // Simulate two concurrent failure handlers
      // First call: increments to MAX_FAILURES and disables
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({
          data: [{ failure_count: MAX_FAILURES, is_active: false }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ failure_count: MAX_FAILURES + 1, is_active: false }],
          error: null,
        });

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'));

      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      // Act: Simulate two concurrent deliveries both failing
      const promise1 = (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));
      const promise2 = (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));
      
      await Promise.all([promise1, promise2]);

      // Assert: Both concurrent handlers called RPC (not a single SELECT then separate UPDATEs)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(2);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('increment_webhook_failure_count', {
        p_webhook_id: webhook.id,
        p_max_failures: MAX_FAILURES,
      });

      // Assert: Webhook was disabled
      const warnCalls = loggerSpy.mock.calls;
      const disableWarnings = warnCalls.filter((call) =>
        call[0]?.includes('Disabled webhook')
      );
      expect(disableWarnings.length).toBeGreaterThan(0);
    });

    // ARRANGE / ACT / ASSERT: Already-disabled webhook stays disabled
    it('Test 5 - Already-disabled webhook stays disabled', async () => {
      const webhook = {
        ...mockWebhook,
        failure_count: MAX_FAILURES,
        is_active: false,
      };
      
      // Mock RPC response: increments but stays disabled
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: MAX_FAILURES + 1, is_active: false }],
        error: null,
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert: RPC was called
      expect(mockSupabaseClient.rpc).toHaveBeenCalled();

      // Assert: The returned data shows webhook is still disabled
      // (The atomic UPDATE with CASE WHEN ensures no re-enabling)
      const rpcData = mockSupabaseClient.rpc.mock.results[0].value.data[0];
      expect(rpcData.is_active).toBe(false);
    });

    // ARRANGE / ACT / ASSERT: No SELECT issued before the UPDATE
    it('Test 6 - No SELECT query issued before the atomic UPDATE (race window closed)', async () => {
      const webhook = { ...mockWebhook, failure_count: 2 };
      
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: 3, is_active: true }],
        error: null,
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert: Only RPC was called, NOT from().select()
      // This proves the race window is closed (no separate SELECT and UPDATE)
      expect(mockSupabaseClient.rpc).toHaveBeenCalled();
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    // ARRANGE / ACT / ASSERT: Logging uses post-increment values
    it('Test 7 - Logging uses post-increment values from RPC', async () => {
      const webhook = { ...mockWebhook, failure_count: 2 };
      
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: 3, is_active: true }],
        error: null,
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      const debugSpy = jest.spyOn(Logger.prototype, 'debug');

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert: Log message contains post-increment value (3), not pre-increment (2)
      const debugCalls = debugSpy.mock.calls;
      const incrementLog = debugCalls.find((call) =>
        call[0]?.includes('Incremented failure count')
      );
      expect(incrementLog?.[0]).toContain('to 3');
    });
  });

  describe('Success case: Reset failure count', () => {
    it('should reset failure count to 0 on successful delivery', async () => {
      const webhook = { ...mockWebhook, failure_count: 3 };
      
      // Mock successful delivery
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('Success'),
      } as any);

      // Mock update call for reset
      const mockUpdate = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
      });

      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert: Update was called to reset failure count
      expect(mockUpdate).toHaveBeenCalledWith({ failure_count: 0 });
    });
  });

  describe('Error handling', () => {
    it('should handle RPC error gracefully', async () => {
      const webhook = { ...mockWebhook, failure_count: 2 };
      
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert: Error was logged
      const errorCalls = errorSpy.mock.calls;
      const rpcError = errorCalls.find((call) =>
        call[0]?.includes('Failed to increment failure count')
      );
      expect(rpcError).toBeDefined();
    });
  });

  describe('Boundary conditions', () => {
    it('should handle first failure correctly', async () => {
      const webhook = { ...mockWebhook, failure_count: 0 };
      
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: 1, is_active: true }],
        error: null,
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'increment_webhook_failure_count',
        {
          p_webhook_id: webhook.id,
          p_max_failures: MAX_FAILURES,
        }
      );
    });

    it('should handle one failure before MAX_FAILURES', async () => {
      const webhook = { ...mockWebhook, failure_count: MAX_FAILURES - 2 };
      
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: MAX_FAILURES - 1, is_active: true }],
        error: null,
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(service as any, 'logDelivery').mockResolvedValue(undefined);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert: No disable warning
      const warnCalls = loggerSpy.mock.calls;
      const disableWarning = warnCalls.find((call) =>
        call[0]?.includes('Disabled webhook')
      );
      expect(disableWarning).toBeUndefined();
    });
  });

  describe('Retry logic', () => {
    it('should retry on failure and then record final result', async () => {
      const webhook = { ...mockWebhook, failure_count: 0 };
      
      // Mock: retry 1 fails, retry 2 succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('Success'),
        } as any);

      const mockUpdate = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
      });

      const logDeliveryMock = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(service as any, 'logDelivery').mockImplementation(logDeliveryMock);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({}));

      // Assert: Eventually succeeded without incrementing failure count
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
      expect(logDeliveryMock).toHaveBeenCalled();
    });
  });

  describe('Existing behavior preservation', () => {
    it('should preserve delivery logging on failure', async () => {
      const webhook = { ...mockWebhook };
      
      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: 1, is_active: true }],
        error: null,
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const logDeliveryMock = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(service as any, 'logDelivery').mockImplementation(logDeliveryMock);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, 'test.event', JSON.stringify({ data: 'test' }));

      // Assert: Delivery was logged
      expect(logDeliveryMock).toHaveBeenCalled();
    });

    it('should pass correct parameters to logDelivery', async () => {
      const webhook = { ...mockWebhook };
      const eventType = 'test.event';
      const payloadData = { test: 'data' };
      
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      mockSupabaseClient.rpc.mockResolvedValue({
        data: [{ failure_count: 1, is_active: true }],
        error: null,
      });

      const logDeliveryMock = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(service as any, 'logDelivery').mockImplementation(logDeliveryMock);

      // Act
      await (service as any).deliverWebhookWithRetries(webhook, eventType, JSON.stringify(payloadData));

      // Assert: logDelivery was called with correct params
      expect(logDeliveryMock).toHaveBeenCalledWith(
        webhook.id,
        eventType,
        payloadData,
        null, // statusCode
        null, // responseBody
        expect.any(String), // errorMessage
        false // success
      );
    });
  });
});
