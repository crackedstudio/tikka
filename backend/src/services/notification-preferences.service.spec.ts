import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { SUPABASE_CLIENT } from './supabase.provider';

describe('NotificationService - Preferences', () => {
  let service: NotificationService;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      single: jest.fn(),
      order: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: SUPABASE_CLIENT,
          useValue: mockSupabaseClient,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreferences', () => {
    it('should return user preferences when they exist', async () => {
      const userAddress = 'GTEST123456789';
      const mockPrefs = {
        user_address: userAddress,
        raffle_end: false,
        win_notification: true,
        channel: 'push',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: mockPrefs, error: null });

      const result = await service.getPreferences(userAddress);

      expect(result).toEqual(mockPrefs);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('notification_preferences');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_address', userAddress);
    });

    it('should return default preferences when user has no preferences', async () => {
      const userAddress = 'GTEST123456789';

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await service.getPreferences(userAddress);

      expect(result.user_address).toBe(userAddress);
      expect(result.raffle_end).toBe(true);
      expect(result.win_notification).toBe(true);
      expect(result.channel).toBe('email');
    });

    it('should throw error on database failure', async () => {
      const userAddress = 'GTEST123456789';

      mockSupabaseClient.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getPreferences(userAddress)).rejects.toThrow(
        'Failed to fetch preferences: Database error',
      );
    });
  });

  describe('updatePreferences', () => {
    it('should update all preferences', async () => {
      const userAddress = 'GTEST123456789';
      const payload = {
        raffleEnd: false,
        winNotification: false,
        channel: 'push' as const,
      };
      const mockUpdated = {
        user_address: userAddress,
        raffle_end: false,
        win_notification: false,
        channel: 'push',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: expect.any(String),
      };

      mockSupabaseClient.single.mockResolvedValue({ data: mockUpdated, error: null });

      const result = await service.updatePreferences(userAddress, payload);

      expect(result).toEqual(mockUpdated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('notification_preferences');
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_address: userAddress,
          raffle_end: false,
          win_notification: false,
          channel: 'push',
        }),
        { onConflict: 'user_address' },
      );
    });

    it('should update only specified fields', async () => {
      const userAddress = 'GTEST123456789';
      const payload = {
        raffleEnd: false,
      };
      const mockUpdated = {
        user_address: userAddress,
        raffle_end: false,
        win_notification: true,
        channel: 'email',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: expect.any(String),
      };

      mockSupabaseClient.single.mockResolvedValue({ data: mockUpdated, error: null });

      const result = await service.updatePreferences(userAddress, payload);

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_address: userAddress,
          raffle_end: false,
        }),
        { onConflict: 'user_address' },
      );
    });

    it('should throw error on database failure', async () => {
      const userAddress = 'GTEST123456789';
      const payload = { raffleEnd: false };

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      });

      await expect(service.updatePreferences(userAddress, payload)).rejects.toThrow(
        'Failed to update preferences: Update failed',
      );
    });
  });

  describe('canSendRaffleEnd', () => {
    it('should return true when user has opted in', async () => {
      const userAddress = 'GTEST123456789';
      const mockPrefs = {
        user_address: userAddress,
        raffle_end: true,
        win_notification: true,
        channel: 'email',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: mockPrefs, error: null });

      const result = await service.canSendRaffleEnd(userAddress);

      expect(result).toBe(true);
    });

    it('should return false when user has opted out', async () => {
      const userAddress = 'GTEST123456789';
      const mockPrefs = {
        user_address: userAddress,
        raffle_end: false,
        win_notification: true,
        channel: 'email',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: mockPrefs, error: null });

      const result = await service.canSendRaffleEnd(userAddress);

      expect(result).toBe(false);
    });

    it('should return true by default when no preferences set', async () => {
      const userAddress = 'GTEST123456789';

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await service.canSendRaffleEnd(userAddress);

      expect(result).toBe(true);
    });
  });

  describe('canSendWinner', () => {
    it('should return true when user has opted in', async () => {
      const userAddress = 'GTEST123456789';
      const mockPrefs = {
        user_address: userAddress,
        raffle_end: true,
        win_notification: true,
        channel: 'email',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: mockPrefs, error: null });

      const result = await service.canSendWinner(userAddress);

      expect(result).toBe(true);
    });

    it('should return false when user has opted out', async () => {
      const userAddress = 'GTEST123456789';
      const mockPrefs = {
        user_address: userAddress,
        raffle_end: true,
        win_notification: false,
        channel: 'email',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: mockPrefs, error: null });

      const result = await service.canSendWinner(userAddress);

      expect(result).toBe(false);
    });
  });

  describe('getRaffleEndSubscribers', () => {
    it('should filter subscribers based on preferences', async () => {
      const raffleId = 1;
      const allSubscribers = [
        { id: '1', raffle_id: raffleId, user_address: 'USER1', channel: 'email', created_at: '2024-01-01T00:00:00Z' },
        { id: '2', raffle_id: raffleId, user_address: 'USER2', channel: 'email', created_at: '2024-01-01T00:00:00Z' },
        { id: '3', raffle_id: raffleId, user_address: 'USER3', channel: 'push', created_at: '2024-01-01T00:00:00Z' },
      ];

      // Mock getRaffleSubscribers
      mockSupabaseClient.maybeSingle.mockImplementation(async () => {
        return { data: null, error: null };
      });

      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(allSubscribers);

      // Mock preferences: USER2 opted out of raffle_end
      jest.spyOn(service, 'canSendRaffleEnd').mockImplementation(async (address) => {
        return address !== 'USER2';
      });

      const result = await service.getRaffleEndSubscribers(raffleId);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.user_address)).toEqual(['USER1', 'USER3']);
    });

    it('should return empty array when all subscribers opted out', async () => {
      const raffleId = 1;
      const allSubscribers = [
        { id: '1', raffle_id: raffleId, user_address: 'USER1', channel: 'email', created_at: '2024-01-01T00:00:00Z' },
      ];

      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(allSubscribers);
      jest.spyOn(service, 'canSendRaffleEnd').mockResolvedValue(false);

      const result = await service.getRaffleEndSubscribers(raffleId);

      expect(result).toHaveLength(0);
    });
  });

  describe('getWinnerSubscribers', () => {
    it('should filter subscribers based on win notification preferences', async () => {
      const raffleId = 1;
      const allSubscribers = [
        { id: '1', raffle_id: raffleId, user_address: 'USER1', channel: 'email', created_at: '2024-01-01T00:00:00Z' },
        { id: '2', raffle_id: raffleId, user_address: 'USER2', channel: 'email', created_at: '2024-01-01T00:00:00Z' },
      ];

      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(allSubscribers);

      // Mock preferences: USER2 opted out of win_notification
      jest.spyOn(service, 'canSendWinner').mockImplementation(async (address) => {
        return address !== 'USER2';
      });

      const result = await service.getWinnerSubscribers(raffleId);

      expect(result).toHaveLength(1);
      expect(result[0].user_address).toBe('USER1');
    });
  });
});
