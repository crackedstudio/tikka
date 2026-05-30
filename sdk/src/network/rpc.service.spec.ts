import { RpcService } from './rpc.service';
import {
  TikkaSdkError,
  TikkaSdkErrorCode,
  RpcTimeoutError,
  RateLimitError,
  UnavailableError,
  InvalidResponseError,
  ContractFailureError,
} from '../utils/errors';
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
  const mainnetNetwork: NetworkConfig = {
    network: 'mainnet' as TikkaNetwork,
    rpcUrl: 'https://soroban.stellar.org',
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: Networks.PUBLIC,
  };

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

  it('should retry on retryable http statuses', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ result: { status: 'ok-after-retry' } }),
      });

    service.configure({
      fetchClient: mockFetch as any,
      maxRetryAttempts: 2,
      retryBaseDelayMs: 1,
    });

    const mockTx = { toXDR: () => 'mock-xdr' };
    const result = await service.simulateTransaction(mockTx);
    expect(result).toEqual({ status: 'ok-after-retry' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should allow disabling retries per call', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    service.configure({
      fetchClient: mockFetch as any,
      maxRetryAttempts: 3,
      retryBaseDelayMs: 1,
    });

    const mockTx = { toXDR: () => 'mock-xdr' };
    await expect(service.simulateTransaction(mockTx, { disableRetries: true })).rejects.toThrow(TikkaSdkError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should default endpoint from network config when not provided', async () => {
    const mainnetService = new RpcService(mainnetNetwork);
    expect((mainnetService as any).rpcConfig.endpoint).toBe(mainnetNetwork.rpcUrl);
  });

  it('should expose getLedger method', async () => {
    const mockResult = { sequence: 12345 };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ result: mockResult }),
    });

    service.configure({ fetchClient: mockFetch as any });
    const result = await service.getLedger();
    expect(result).toEqual(mockResult);
    expect(mockFetch).toHaveBeenCalledWith(
      mockNetwork.rpcUrl,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"method":"getLatestLedger"'),
      }),
    );
  });

  it('getTransaction makes a single request and returns the raw response', async () => {
    const mockResp = { status: 'NOT_FOUND' };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ result: mockResp }),
    });

    service.configure({ fetchClient: mockFetch as any });
    const result = await service.getTransaction('abc123');

    expect(result).toEqual(mockResp);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      mockNetwork.rpcUrl,
      expect.objectContaining({
        body: expect.stringContaining('"method":"getTransaction"'),
      }),
    );
  });

  describe('RPC Retry, Timeout, Circuit-Breaker, and Typed Errors', () => {
    it('should throw RpcTimeoutError on request timeout', async () => {
      const abortError = new Error('The user aborted a request.');
      abortError.name = 'AbortError';
      const mockFetch = jest.fn().mockRejectedValue(abortError);

      service.configure({ fetchClient: mockFetch as any, timeoutMs: 100 });
      const mockTx = { toXDR: () => 'mock-xdr' };

      await expect(service.simulateTransaction(mockTx)).rejects.toThrow(RpcTimeoutError);
    });

    it('should retry on rate limit and eventually succeed', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ result: { status: 'ok' } }),
        });

      service.configure({
        fetchClient: mockFetch as any,
        maxRetryAttempts: 2,
        retryBaseDelayMs: 1,
      });

      const mockTx = { toXDR: () => 'mock-xdr' };
      const result = await service.simulateTransaction(mockTx);
      expect(result).toEqual({ status: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should exhaust retries on unavailable status and throw UnavailableError', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      service.configure({
        fetchClient: mockFetch as any,
        maxRetryAttempts: 3,
        retryBaseDelayMs: 1,
      });

      const mockTx = { toXDR: () => 'mock-xdr' };
      await expect(service.simulateTransaction(mockTx)).rejects.toThrow(UnavailableError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail immediately without retrying on non-retryable errors (e.g. invalid response status 400)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      service.configure({
        fetchClient: mockFetch as any,
        maxRetryAttempts: 3,
        retryBaseDelayMs: 1,
      });

      const mockTx = { toXDR: () => 'mock-xdr' };
      await expect(service.simulateTransaction(mockTx)).rejects.toThrow(InvalidResponseError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should classify contract-specific execution failures as ContractFailureError', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          error: {
            code: -32603,
            message: 'HostValidationError: ContractError(1)',
          },
        }),
      });

      service.configure({ fetchClient: mockFetch as any });
      const mockTx = { toXDR: () => 'mock-xdr' };

      await expect(service.simulateTransaction(mockTx)).rejects.toThrow(ContractFailureError);
    });

    it('should transition circuit breaker to open on consecutive infra failures and fail fast', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      service.configure({
        fetchClient: mockFetch as any,
        maxRetryAttempts: 1,
        circuitBreakerFailureThreshold: 3,
        circuitBreakerResetTimeoutMs: 1000,
      });

      const mockTx = { toXDR: () => 'mock-xdr' };

      // Make 3 failing calls to trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(service.simulateTransaction(mockTx)).rejects.toThrow(UnavailableError);
      }

      // Current state should be 'open' and degraded
      expect(service.getCircuitState()).toBe('open');
      expect(service.isDegraded()).toBe(true);

      // The 4th call should fail immediately without even calling fetch
      mockFetch.mockClear();
      await expect(service.simulateTransaction(mockTx)).rejects.toThrow(UnavailableError);
      expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    it('should transition circuit breaker to half-open after reset timeout and allow probe request', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      service.configure({
        fetchClient: mockFetch as any,
        maxRetryAttempts: 1,
        circuitBreakerFailureThreshold: 1,
        circuitBreakerResetTimeoutMs: 50,
      });

      const mockTx = { toXDR: () => 'mock-xdr' };

      // Trip circuit
      await expect(service.simulateTransaction(mockTx)).rejects.toThrow(UnavailableError);
      expect(service.getCircuitState()).toBe('open');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should be half-open
      expect(service.getCircuitState()).toBe('half-open');

      // Allow a probe call, which we mock as successful
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ result: { status: 'recovered' } }),
      });

      const result = await service.simulateTransaction(mockTx);
      expect(result).toEqual({ status: 'recovered' });
      expect(service.getCircuitState()).toBe('closed');
      expect(service.isDegraded()).toBe(false);
    });
  });
});
