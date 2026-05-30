import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PushNotificationService, DeliveryFailureClass } from './push-notification.service';
import { SUPABASE_CLIENT } from './supabase.provider';
import { env } from '../config/env.config';
import * as admin from 'firebase-admin';

// Mock the config module so env.fcm.enabled can be toggled per-test.
// The real env object is frozen/getter-based and cannot be mutated directly.
jest.mock('../config/env.config', () => ({
  env: {
    fcm: {
      enabled: false,
      serviceAccountJson: undefined,
      serviceAccountPath: undefined,
    },
    supabase: {
      url: 'http://localhost',
      serviceRoleKey: 'test-key',
    },
  },
}));

jest.mock('firebase-admin', () => {
  const sendEachForMulticast = jest.fn();
  return {
    apps: [{}],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    messaging: jest.fn(() => ({ sendEachForMulticast })),
  };
});

const sendEachForMulticast = (admin.messaging() as unknown as {
  sendEachForMulticast: jest.Mock;
}).sendEachForMulticast;

describe('PushNotificationService', () => {
  let service: PushNotificationService;

  // Tracks what mockSelect should resolve to for the next call
  let selectResult: { data: unknown; error: unknown } = { data: [], error: null };

  const mockEq = jest.fn();
  const mockIn = jest.fn();
  const mockSingle = jest.fn();
  const mockInsert = jest.fn().mockResolvedValue({ error: null });
  const mockUpsert = jest.fn(() => ({ select: () => ({ single: mockSingle }) }));
  const mockDelete = jest.fn(() => ({
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ error: null }),
  }));

  // select('*').eq(...) must return a Promise
  const mockSelect = jest.fn(() => ({
    eq: jest.fn().mockResolvedValue(selectResult),
  }));

  const supabaseMock = {
    from: jest.fn(() => ({
      upsert: mockUpsert,
      delete: mockDelete,
      select: mockSelect,
      insert: mockInsert,
      eq: mockEq,
      in: mockIn,
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    selectResult = { data: [], error: null };
    // Reset config to disabled before each test.
    (env.fcm as { enabled: boolean }).enabled = false;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        { provide: SUPABASE_CLIENT, useValue: supabaseMock },
      ],
    }).compile();

    service = module.get<PushNotificationService>(PushNotificationService);
  });

  it('registers a device token', async () => {
    mockSingle.mockResolvedValue({ data: { user_address: 'GABC', device_token: 'tok' }, error: null });

    const result = await service.registerDeviceToken('GABC', 'tok');

    expect(result).toEqual({ user_address: 'GABC', device_token: 'tok' });
    expect(supabaseMock.from).toHaveBeenCalledWith('push_tokens');
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockSingle).toHaveBeenCalled();
  });

  it('unregisters a device token', async () => {
    await service.unregisterDeviceToken('GABC', 'tok');
    expect(supabaseMock.from).toHaveBeenCalledWith('push_tokens');
    expect(mockDelete).toHaveBeenCalled();
  });

  it('gets device tokens for a user', async () => {
    selectResult = { data: [{ user_address: 'GABC', device_token: 'tok', platform: 'fcm' }], error: null };

    const tokens = await service.getDeviceTokens('GABC');

    expect(tokens).toEqual([{ user_address: 'GABC', device_token: 'tok', platform: 'fcm' }]);
    expect(supabaseMock.from).toHaveBeenCalledWith('push_tokens');
    expect(mockSelect).toHaveBeenCalledWith('*');
  });

  it('throws NotFoundException when sendToUser has no tokens', async () => {
    selectResult = { data: [], error: null };
    await expect(service.sendToUser('GABC', { title: 'hi', body: 'hello' })).rejects.toThrow(NotFoundException);
  });

  it('throws InternalServerErrorException when FCM is not configured', async () => {
    selectResult = { data: [{ user_address: 'GABC', device_token: 'tok', platform: 'fcm' }], error: null };
    await expect(service.sendToUser('GABC', { title: 'hi', body: 'hello' })).rejects.toThrow(InternalServerErrorException);
  });

  describe('delivery failure classification', () => {
    beforeEach(() => {
      // Force the FCM send path to run.
      (env.fcm as { enabled: boolean }).enabled = true;
      (service as unknown as { fcmAppInitialized: boolean }).fcmAppInitialized = true;
    });

    it('classifies a transient provider error as retryable and keeps the token', async () => {
      selectResult = { data: [{ user_address: 'GABC', device_token: 'tok-transient', platform: 'fcm' }], error: null };
      sendEachForMulticast.mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        responses: [
          { success: false, error: { code: 'messaging/internal-error' } },
        ],
      });

      const result = await service.sendToUser('GABC', { title: 'hi', body: 'hello' });

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].classification).toBe(DeliveryFailureClass.TRANSIENT_RETRY);
      expect(result.failures[0].nextAction).toBe('retry');
      expect(result.retryableTokens).toEqual(['tok-transient']);
      expect(result.invalidTokens).toEqual([]);
      // Token must NOT be removed on a transient failure.
      expect(mockDelete).not.toHaveBeenCalled();
      expect(service.getDeliveryMetrics().transientRetry).toBe(1);
    });

    it('classifies an unregistered token as permanent and removes it', async () => {
      selectResult = { data: [{ user_address: 'GABC', device_token: 'tok-dead', platform: 'fcm' }], error: null };
      sendEachForMulticast.mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        responses: [
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        ],
      });

      const result = await service.sendToUser('GABC', { title: 'hi', body: 'hello' });

      expect(result.failures[0].classification).toBe(DeliveryFailureClass.PERMANENT_INVALID_TOKEN);
      expect(result.failures[0].nextAction).toBe('remove_token');
      expect(result.invalidTokens).toEqual(['tok-dead']);
      expect(result.retryableTokens).toEqual([]);
      // Stale token must be deleted from push_tokens.
      expect(mockDelete).toHaveBeenCalled();
      expect(service.getDeliveryMetrics().permanentInvalidToken).toBe(1);
    });

    it('classifies a whole-batch failure as a provider outage and surfaces it as retryable', async () => {
      selectResult = { data: [{ user_address: 'GABC', device_token: 'tok-1', platform: 'fcm' }], error: null };
      sendEachForMulticast.mockRejectedValue(
        Object.assign(new Error('backend unavailable'), { code: 'messaging/server-unavailable' }),
      );

      await expect(service.sendToUser('GABC', { title: 'hi', body: 'hello' })).rejects.toThrow(InternalServerErrorException);

      // The outage is recorded so operators can see undelivered classes.
      expect(service.getDeliveryMetrics().providerOutage).toBe(1);
      expect(service.getDeliveryMetrics().totalFailures).toBe(1);
      // No token should be removed on a provider-wide outage.
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('getDeliveryMetrics', () => {
    it('returns zeroed counters before any failures', () => {
      expect(service.getDeliveryMetrics()).toEqual({
        transientRetry: 0,
        permanentInvalidToken: 0,
        permanentOther: 0,
        providerOutage: 0,
        totalFailures: 0,
      });
    });
  });
});