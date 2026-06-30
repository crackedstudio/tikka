import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationService } from '../../../services/notification.service';
import { PushNotificationService } from '../../../services/push-notification.service';

describe('NotificationsController - Preferences', () => {
  let controller: NotificationsController;
  let service: NotificationsService;
  let notificationService: NotificationService;

  const mockNotificationService = {
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  };

  const mockPushNotificationService = {
    sendToUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationsService,
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: PushNotificationService,
          useValue: mockPushNotificationService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get<NotificationsService>(NotificationsService);
    notificationService = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /notifications/preferences', () => {
    it('should return default preferences when not set', async () => {
      const userAddress = 'GTEST123456789';
      const mockPrefs = {
        user_address: userAddress,
        raffle_end: true,
        win_notification: true,
        channel: 'email' as const,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockNotificationService.getPreferences.mockResolvedValue(mockPrefs);

      const result = await controller.getPreferences(userAddress);

      expect(result).toEqual({
        userAddress,
        raffleEnd: true,
        winNotification: true,
        channel: 'email',
        updatedAt: '2024-01-01T00:00:00Z',
      });
      expect(mockNotificationService.getPreferences).toHaveBeenCalledWith(userAddress);
    });

    it('should return user-specific preferences when set', async () => {
      const userAddress = 'GTEST123456789';
      const mockPrefs = {
        user_address: userAddress,
        raffle_end: false,
        win_notification: true,
        channel: 'push' as const,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      mockNotificationService.getPreferences.mockResolvedValue(mockPrefs);

      const result = await controller.getPreferences(userAddress);

      expect(result).toEqual({
        userAddress,
        raffleEnd: false,
        winNotification: true,
        channel: 'push',
        updatedAt: '2024-01-02T00:00:00Z',
      });
    });
  });

  describe('PUT /notifications/preferences', () => {
    it('should update all preferences', async () => {
      const userAddress = 'GTEST123456789';
      const dto = {
        raffleEnd: false,
        winNotification: false,
        channel: 'push' as const,
      };
      const mockUpdatedPrefs = {
        user_address: userAddress,
        raffle_end: false,
        win_notification: false,
        channel: 'push' as const,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-03T00:00:00Z',
      };

      mockNotificationService.updatePreferences.mockResolvedValue(mockUpdatedPrefs);

      const result = await controller.updatePreferences(dto, userAddress);

      expect(result).toEqual({
        userAddress,
        raffleEnd: false,
        winNotification: false,
        channel: 'push',
        updatedAt: '2024-01-03T00:00:00Z',
      });
      expect(mockNotificationService.updatePreferences).toHaveBeenCalledWith(
        userAddress,
        dto,
      );
    });

    it('should update only raffleEnd preference', async () => {
      const userAddress = 'GTEST123456789';
      const dto = {
        raffleEnd: false,
      };
      const mockUpdatedPrefs = {
        user_address: userAddress,
        raffle_end: false,
        win_notification: true,
        channel: 'email' as const,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-03T00:00:00Z',
      };

      mockNotificationService.updatePreferences.mockResolvedValue(mockUpdatedPrefs);

      const result = await controller.updatePreferences(dto, userAddress);

      expect(result.raffleEnd).toBe(false);
      expect(result.winNotification).toBe(true);
    });

    it('should update only channel preference', async () => {
      const userAddress = 'GTEST123456789';
      const dto = {
        channel: 'push' as const,
      };
      const mockUpdatedPrefs = {
        user_address: userAddress,
        raffle_end: true,
        win_notification: true,
        channel: 'push' as const,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-03T00:00:00Z',
      };

      mockNotificationService.updatePreferences.mockResolvedValue(mockUpdatedPrefs);

      const result = await controller.updatePreferences(dto, userAddress);

      expect(result.channel).toBe('push');
    });
  });
});
