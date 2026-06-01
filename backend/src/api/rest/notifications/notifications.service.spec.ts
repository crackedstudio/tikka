import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { NotificationService } from '../../../services/notification.service';
import { PushNotificationService } from '../../../services/push-notification.service';
import { NotFoundException } from '@nestjs/common';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationService: jest.Mocked<NotificationService>;
  let pushNotificationService: jest.Mocked<PushNotificationService>;

  beforeEach(async () => {
    notificationService = {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getUserSubscriptions: jest.fn(),
      getSubscription: jest.fn(),
      getRaffleSubscribers: jest.fn(),
      isSubscribed: jest.fn(),
      updateSubscription: jest.fn(),
    } as any;

    pushNotificationService = {
      registerDeviceToken: jest.fn(),
      unregisterDeviceToken: jest.fn(),
      getDeviceTokens: jest.fn(),
      sendToUser: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationService, useValue: notificationService },
        { provide: PushNotificationService, useValue: pushNotificationService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should create a subscription', async () => {
    notificationService.subscribe.mockResolvedValue({
      id: 'sub-1',
      raffle_id: 1,
      user_address: '0x123',
      channel: 'email',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    const result = await service.subscribe({
      raffleId: 1,
      userAddress: '0x123',
      channel: 'email',
    });

    expect(result.id).toBe('sub-1');
    expect(notificationService.subscribe).toHaveBeenCalledWith({
      raffleId: 1,
      userAddress: '0x123',
      channel: 'email',
    });
  });

  it('should update a subscription', async () => {
    await service.updateSubscription('sub-1', { channel: 'push' });
    expect(notificationService.updateSubscription).toHaveBeenCalledWith('sub-1', { channel: 'push' });
  });

  it('should handle duplicate token by returning existing subscription (handled in core service)', async () => {
    // The underlying NotificationService subscribe returns existing if duplicate
    notificationService.subscribe.mockResolvedValue({
      id: 'sub-existing',
      raffle_id: 1,
      user_address: '0x123',
      channel: 'push',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    const result = await service.subscribe({
      raffleId: 1,
      userAddress: '0x123',
      channel: 'push',
    });

    expect(result.id).toBe('sub-existing');
  });

  it('should unsubscribe from a raffle', async () => {
    await service.unsubscribe(1, '0x123');
    expect(notificationService.unsubscribe).toHaveBeenCalledWith(1, '0x123');
  });

  it('should handle invalid token registration (throws error)', async () => {
    pushNotificationService.registerDeviceToken.mockRejectedValue(new Error('Invalid token'));
    
    await expect(service.registerDeviceToken('0x123', '', 'fcm')).rejects.toThrow('Invalid token');
  });
});
