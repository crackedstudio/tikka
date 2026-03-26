import { RpcService } from './rpc.service';
import { RpcError } from '../utils/errors';

describe('RpcService', () => {
  let service: RpcService;
  const mockEndpoint = 'https://primary.rpc.com';
  const mockFailover = 'https://backup.rpc.com';

  beforeEach(() => {
    service = new RpcService({ endpoint: mockEndpoint });
  });

  it('should use default config if none provided', () => {
    const defaultService = new RpcService();
    expect((defaultService as any).config.endpoint).toBe('https://soroban-testnet.stellar.org');
  });

  it('should allow runtime configuration updates', () => {
    service.configure({ timeoutMs: 5000 });
    expect((service as any).config.timeoutMs).toBe(5000);
  });

  it('should override endpoint via setEndpoint', () => {
    service.setEndpoint('https://new.rpc.com');
    expect((service as any).config.endpoint).toBe('https://new.rpc.com');
  });

  it('should add failover endpoints', () => {
    service.addFailoverEndpoint(mockFailover);
    expect((service as any).config.failoverEndpoints).toContain(mockFailover);
  });

  it('should merge headers via setHeaders', () => {
    service.setHeaders({ 'X-API-Key': '123' });
    service.setHeaders({ 'Content-Type': 'application/json' });
    expect((service as any).config.headers).toEqual({
      'X-API-Key': '123',
      'Content-Type': 'application/json',
    });
  });

  it('should execute a successful request and return result', async () => {
    const mockResult = { status: 'success' };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ result: mockResult }),
    });

    service.setFetchClient(mockFetch as any);
    const result = await service.request('get_info');

    expect(result).toEqual(mockResult);
    expect(mockFetch).toHaveBeenCalledWith(mockEndpoint, expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"method":"get_info"'),
    }));
  });

  it('should failover to secondary endpoint if primary fails', async () => {
    const mockResult = { status: 'recovered' };
    const mockFetch = jest.fn()
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ result: mockResult }),
      });

    service.addFailoverEndpoint(mockFailover);
    service.setFetchClient(mockFetch as any);

    const result = await service.request('get_info');

    expect(result).toEqual(mockResult);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(1, mockEndpoint, expect.anything());
    expect(mockFetch).toHaveBeenNthCalledWith(2, mockFailover, expect.anything());
  });

  it('should throw Error if all endpoints fail', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Down'));
    service.addFailoverEndpoint(mockFailover);
    service.setFetchClient(mockFetch as any);

    await expect(service.request('get_info')).rejects.toThrow('Down');
  });

  it('should throw RpcError if response is not ok', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    service.setFetchClient(mockFetch as any);

    await expect(service.request('get_info')).rejects.toThrow(RpcError);
  });

  it('should throw RpcError if payload contains error', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ error: { message: 'Method not found' } }),
    });

    service.setFetchClient(mockFetch as any);

    await expect(service.request('get_info')).rejects.toThrow('Method not found');
  });
});
