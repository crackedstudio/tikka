import { PinningService } from './pinning.service';
import { env } from '../config/env.config';
import { RaffleMetadata } from './metadata.service';

describe('PinningService', () => {
  let service: PinningService;
  let fetchSpy: jest.SpyInstance;
  let storageSpy: jest.SpyInstance;

  const mockMetadata: RaffleMetadata = {
    raffle_id: 1,
    title: 'Test Raffle',
    description: 'A test raffle description',
    image_url: 'https://example.com/image.png',
    image_urls: ['https://example.com/image.png'],
    category: 'Art',
    metadata_cid: null,
    created_at: '2026-06-27T08:00:00Z',
    updated_at: '2026-06-27T08:00:00Z',
    deleted_at: null,
  };

  beforeEach(() => {
    service = new PinningService();
    fetchSpy = jest.spyOn(global, 'fetch');
    storageSpy = jest.spyOn(env, 'storage', 'get').mockReturnValue({
      enableIpfsPinning: true,
      pinataJwt: 'mock-jwt-token',
      pinataApiKey: 'mock-api-key',
      pinataApiSecret: 'mock-api-secret',
      ipfsGatewayUrl: 'https://ipfs.io/ipfs/',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return null if IPFS pinning is disabled', async () => {
    storageSpy.mockReturnValue({
      enableIpfsPinning: false,
      pinataJwt: 'mock-jwt-token',
      pinataApiKey: 'mock-api-key',
      pinataSecret: 'mock-api-secret',
      ipfsGatewayUrl: 'https://ipfs.io/ipfs/',
    });

    const result = await service.pin(mockMetadata);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return null if Pinata credentials are missing', async () => {
    storageSpy.mockReturnValue({
      enableIpfsPinning: true,
      pinataJwt: undefined,
      pinataApiKey: undefined,
      pinataApiSecret: undefined,
      ipfsGatewayUrl: 'https://ipfs.io/ipfs/',
    });

    const result = await service.pin(mockMetadata);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should pin metadata successfully using PINATA_JWT and return the CID', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ IpfsHash: 'QmSuccessCid' }),
    };
    fetchSpy.mockResolvedValue(mockResponse as any);

    const result = await service.pin(mockMetadata);

    expect(result).toBe('QmSuccessCid');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-jwt-token',
        }),
      }),
    );
  });

  it('should pin metadata successfully using api key and secret when JWT is absent', async () => {
    storageSpy.mockReturnValue({
      enableIpfsPinning: true,
      pinataJwt: undefined,
      pinataApiKey: 'mock-api-key',
      pinataApiSecret: 'mock-api-secret',
      ipfsGatewayUrl: 'https://ipfs.io/ipfs/',
    });

    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ IpfsHash: 'QmSuccessApiKeyCid' }),
    };
    fetchSpy.mockResolvedValue(mockResponse as any);

    const result = await service.pin(mockMetadata);

    expect(result).toBe('QmSuccessApiKeyCid');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          pinata_api_key: 'mock-api-key',
          pinata_secret_api_key: 'mock-api-secret',
        }),
      }),
    );
  });

  it('should return null and log error if Pinata API response is not ok', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('Unauthorized'),
    };
    fetchSpy.mockResolvedValue(mockResponse as any);

    const result = await service.pin(mockMetadata);

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('should return null and log error if fetch throws a network error', async () => {
    fetchSpy.mockRejectedValue(new Error('Network disconnected'));

    const result = await service.pin(mockMetadata);

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
