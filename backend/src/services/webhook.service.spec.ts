import { Test, TestingModule } from '@nestjs/testing';
import { Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { WebhookService, Webhook, WebhookDelivery } from './webhook.service';
import { SUPABASE_CLIENT } from './supabase.provider';
import { WEBHOOK_DELIVERY_QUEUE } from '../queues/webhook-delivery.constants';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';

describe('WebhookService', () => {
  let service: WebhookService;
  let mockSupabaseClient: any;
  let mockQueue: jest.Mocked<Queue>;

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
    jest.clearAllMocks();

    mockSupabaseClient = {
      from: jest.fn(),
      rpc: jest.fn(),
    };

    mockQueue = {
      add: jest.fn(),
    } as unknown as jest.Mocked<Queue>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: SUPABASE_CLIENT, useValue: mockSupabaseClient },
        { provide: getQueueToken(WEBHOOK_DELIVERY_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);

    jest.spyOn(Logger.prototype, 'warn');
    jest.spyOn(Logger.prototype, 'error');
    jest.spyOn(Logger.prototype, 'debug');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('CRUD', () => {
    describe('createWebhook', () => {
      it('should create a webhook and return it', async () => {
        const insertResult = { error: null, data: mockWebhook };
        const mockSelect = jest.fn().mockReturnThis();
        const mockSingle = jest.fn().mockResolvedValue(insertResult);
        mockSupabaseClient.from.mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          select: mockSelect,
          single: mockSingle,
        });

        const result = await service.createWebhook({
          ownerAddress: 'GTEST123',
          targetUrl: 'https://example.com/webhook',
          events: ['event.test'],
        });

        expect(result).toEqual(mockWebhook);
      });

      it('should throw ConflictException on duplicate URL', async () => {
        const insertResult = { error: { code: '23505' }, data: null };
        const mockSelect = jest.fn().mockReturnThis();
        const mockSingle = jest.fn().mockResolvedValue(insertResult);
        mockSupabaseClient.from.mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          select: mockSelect,
          single: mockSingle,
        });

        await expect(
          service.createWebhook({
            ownerAddress: 'GTEST123',
            targetUrl: 'https://example.com/webhook',
            events: ['event.test'],
          }),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('getWebhooksByOwner', () => {
      it('should return webhooks for the owner', async () => {
        mockSupabaseClient.from.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [mockWebhook], error: null }),
        });

        const result = await service.getWebhooksByOwner('GTEST123');
        expect(result).toEqual([mockWebhook]);
      });

      it('should return empty array when no webhooks', async () => {
        mockSupabaseClient.from.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: null, error: null }),
        });

        const result = await service.getWebhooksByOwner('GTEST123');
        expect(result).toEqual([]);
      });
    });

    describe('getWebhook', () => {
    it('should return a webhook by id', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockWebhook, error: null }),
      });

      const result = await service.getWebhook('webhook-test-id', 'GTEST123');
      expect(result).toEqual(mockWebhook);
    });

    it('should throw NotFoundException when not found', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await expect(
        service.getWebhook('nonexistent', 'GTEST123'),
      ).rejects.toThrow(NotFoundException);
    });
    });

    describe('updateWebhook', () => {
      it('should update a webhook', async () => {
        const mockChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: mockWebhook, error: null }),
          update: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { ...mockWebhook, target_url: 'https://new-url.com' },
            error: null,
          }),
        };
        mockSupabaseClient.from.mockReturnValue(mockChain);

        const result = await service.updateWebhook('webhook-test-id', 'GTEST123', {
          targetUrl: 'https://new-url.com',
        });

        expect(result.target_url).toBe('https://new-url.com');
      });
    });

    describe('deleteWebhook', () => {
      it('should delete a webhook', async () => {
        const mockChain = {
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
        mockSupabaseClient.from.mockReturnValue(mockChain);

        await expect(
          service.deleteWebhook('webhook-test-id', 'GTEST123'),
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('triggerWebhooks', () => {
    const eventType = 'test.event';
    const payloadData = { raffleId: 1, status: 'completed' };

    it('should enqueue a job for each matching webhook', async () => {
      const webhooks = [
        { ...mockWebhook, id: 'wh-1', target_url: 'https://a.com', secret: 's1' },
        { ...mockWebhook, id: 'wh-2', target_url: 'https://b.com', secret: 's2' },
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        contains: jest.fn().mockResolvedValue({ data: webhooks, error: null }),
      });

      mockQueue.add.mockResolvedValue({ id: 'job-1' } as any);

      await service.triggerWebhooks(eventType, payloadData);

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith('deliver', {
        webhookId: 'wh-1',
        targetUrl: 'https://a.com',
        secret: 's1',
        eventType,
        payload: payloadData,
        ownerAddress: 'GTEST123',
      });
      expect(mockQueue.add).toHaveBeenCalledWith('deliver', {
        webhookId: 'wh-2',
        targetUrl: 'https://b.com',
        secret: 's2',
        eventType,
        payload: payloadData,
        ownerAddress: 'GTEST123',
      });
    });

    it('should not enqueue any jobs when no webhooks match', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        contains: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      await service.triggerWebhooks(eventType, payloadData);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should not throw when queue add fails for one webhook', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        contains: jest.fn().mockResolvedValue({
          data: [{ ...mockWebhook, id: 'wh-1' }, { ...mockWebhook, id: 'wh-2' }],
          error: null,
        }),
      });

      mockQueue.add
        .mockRejectedValueOnce(new Error('Queue full'))
        .mockResolvedValueOnce({ id: 'job-2' } as any);

      await expect(
        service.triggerWebhooks(eventType, payloadData),
      ).resolves.toBeUndefined();

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should handle database error gracefully', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        contains: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'DB error' },
        }),
      });

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.triggerWebhooks(eventType, payloadData);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to query webhooks'),
        expect.anything(),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('getDeliveries', () => {
    it('should return deliveries for a webhook', async () => {
      const mockDelivery: WebhookDelivery = {
        id: 'del-1',
        webhook_id: 'wh-1',
        event_type: 'test.event',
        payload: { test: true },
        status_code: 200,
        response_body: 'OK',
        error_message: null,
        success: true,
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockWebhook, error: null }),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [mockDelivery], error: null }),
      });

      const result = await service.getDeliveries('wh-1', 'GTEST123');
      expect(result).toEqual([mockDelivery]);
    });
  });

  describe('getDeadLetters', () => {
    it('should return dead letters for a webhook', async () => {
      const mockDeadLetter = {
        id: 'dl-1',
        webhook_id: 'wh-1',
        target_url: 'https://example.com/webhook',
        event_type: 'test.event',
        payload: { test: true },
        error_message: 'HTTP 500',
        attempts_count: 10,
        last_attempt_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockWebhook, error: null }),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [mockDeadLetter], error: null }),
      });

      const result = await service.getDeadLetters('wh-1', 'GTEST123');
      expect(result).toEqual([mockDeadLetter]);
    });

    it('should throw NotFoundException when webhook not found', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await expect(
        service.getDeadLetters('nonexistent', 'GTEST123'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
