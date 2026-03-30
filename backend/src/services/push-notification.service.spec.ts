import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PushNotificationService } from './push-notification.service';
import { SUPABASE_CLIENT } from './supabase.provider';
import { env } from '../config/env.config';

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  const mockSelect = jest.fn();
  const mockSingle = jest.fn();
  const mockUpsert = jest.fn(() => ({ select: () => ({ single: mockSingle }) }));
  const mockDelete = jest.fn(() => ({ eq: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis() }));

  const supabaseMock = {
    from: jest.fn(() => ({
      upsert: mockUpsert,
      delete: mockDelete,
      select: mockSelect,
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
    mockDelete.mockReturnValue({ eq: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis() });
    await service.unregisterDeviceToken('GABC', 'tok');
    expect(supabaseMock.from).toHaveBeenCalledWith('push_tokens');
    expect(mockDelete).toHaveBeenCalled();
  });

  it('gets device tokens for a user', async () => {
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnThis(), data: [{ user_address: 'GABC', device_token: 'tok', platform: 'fcm' }], error: null });

    const tokens = await service.getDeviceTokens('GABC');

    expect(tokens).toEqual([{ user_address: 'GABC', device_token: 'tok', platform: 'fcm' }]);
    expect(supabaseMock.from).toHaveBeenCalledWith('push_tokens');
  });

  it('throws NotFoundException when sendToUser has no tokens', async () => {
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnThis(), data: [], error: null });
    await expect(service.sendToUser('GABC', { title: 'hi', body: 'hello' })).rejects.toThrow(NotFoundException);
  });

  it('throws InternalServerErrorException when FCM is not configured', async () => {
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnThis(), data: [{ user_address: 'GABC', device_token: 'tok', platform: 'fcm' }], error: null });

    await expect(service.sendToUser('GABC', { title: 'hi', body: 'hello' })).rejects.toThrow(InternalServerErrorException);
  });
});
