import { RpcService } from './rpc.service';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { NetworkConfig, TikkaNetwork } from './network.config';
import { Networks } from '@stellar/stellar-sdk';

describe('RpcService', () => {
  let service: RpcService;
  const mockNetwork: NetworkConfig = {
    network: 'testnet' as TikkaNetwork,
    rpcUrl: 'https://primary.rpc.com',
    horizonUrl: 'https://horizon.com',
    networkPassphrase: Networks.TESTNET,
  };
  const mockFailover = 'https://backup.rpc.com';

  beforeEach(() => {
    service = new RpcService(mockNetwork, { endpoint: mockNetwork.rpcUrl });
  });

  it('should allow runtime configuration updates', () => {
    service.configure({ timeoutMs: 5001 });
    expect((service as any).rpcConfig.timeoutMs).toBe(5001);
  });

  it('should override endpoint via setEndpoint', () => {
    service.setEndpoint('https://new.rpc.com');
    expect((service as any).rpcConfig.endpoint).toBe('https://new.rpc.com');
  });

  it('should add failover endpoints', () => {
    service.addFailoverEndpoint(mockFailover);
    expect((service as any).rpcConfig.failoverEndpoints).toContain(mockFailover);
  });

  it('should execute a successful simulation and return result', async () => {
    const mockResult = { status: 'success' };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ result: mockResult }),
    });

    service.configure({ fetchClient: mockFetch as any });
    
    // Mock a transaction object that has toXDR()
    const mockTx = { toXDR: () => 'mock-xdr' };
    const result = await service.simulateTransaction(mockTx);

    expect(result).toEqual(mockResult);
    expect(mockFetch).toHaveBeenCalledWith(mockNetwork.rpcUrl, expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"method":"simulateTransaction"'),
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
    service.configure({ fetchClient: mockFetch as any });

    const mockTx = { toXDR: () => 'mock-xdr' };
    const result = await service.simulateTransaction(mockTx);

    expect(result).toEqual(mockResult);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw TikkaSdkError if all endpoints fail', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Down'));
    service.addFailoverEndpoint(mockFailover);
    service.configure({ fetchClient: mockFetch as any });

    const mockTx = { toXDR: () => 'mock-xdr' };
    await expect(service.simulateTransaction(mockTx)).rejects.toThrow(TikkaSdkError);
  });
});
