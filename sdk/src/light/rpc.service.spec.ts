import { RpcService } from './rpc.service';
import {
  TikkaSdkError,
} from '../utils/errors';
import { getRetryDecision } from '../utils/retry';
import { Networks } from '@stellar/stellar-sdk';

describe('light RpcService retry (parity with full RpcService)', () => {
  let service: RpcService;
  const mockNetwork = {
    network: 'testnet' as const,
    rpcUrl: 'https://primary.rpc.com',
    horizonUrl: 'https://horizon.com',
    networkPassphrase: Networks.TESTNET,
  };

  beforeEach(() => {
    service = new RpcService(mockNetwork, { endpoint: mockNetwork.rpcUrl });
  });

  it('retries a 503 (5xx) and eventually succeeds', async () => {
    const mockResult = { status: 'ok-after-retry' };
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ result: mockResult }),
      });

    service.configure({ fetchClient: mockFetch as any, maxRetryAttempts: 2, retryBaseDelayMs: 1 });
    const mockTx = { toXDR: () => 'mock-xdr' };
    const result = await service.simulateTransaction(mockTx);

    expect(result).toEqual(mockResult);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries on a 503 and throws a NetworkError', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    service.configure({ fetchClient: mockFetch as any, maxRetryAttempts: 3, retryBaseDelayMs: 1 });
    const mockTx = { toXDR: () => 'mock-xdr' };

    await expect(service.simulateTransaction(mockTx)).rejects.toThrow(TikkaSdkError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry on a 400 (malformed / fatal)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    service.configure({ fetchClient: mockFetch as any, maxRetryAttempts: 3, retryBaseDelayMs: 1 });
    const mockTx = { toXDR: () => 'mock-xdr' };

    await expect(service.simulateTransaction(mockTx)).rejects.toThrow(TikkaSdkError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('marks a TX_BAD_SEQ failure with a refreshSequence decision', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        error: { code: -32003, message: 'tx_bad_seq' },
      }),
    });

    service.configure({ fetchClient: mockFetch as any, maxRetryAttempts: 1, retryBaseDelayMs: 1 });
    const mockTx = { toXDR: () => 'mock-xdr' };

    try {
      await service.simulateTransaction(mockTx);
      throw new Error('should have thrown');
    } catch (error: any) {
      const decision = getRetryDecision(error);
      expect(decision).toMatchObject({ retry: true, refreshSequence: true });
    }
  });

  it('treats a contract failure as fatal (no retry)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        error: { code: -32603, message: 'HostValidationError: ContractError(1)' },
      }),
    });

    service.configure({ fetchClient: mockFetch as any, maxRetryAttempts: 3, retryBaseDelayMs: 1 });
    const mockTx = { toXDR: () => 'mock-xdr' };

    await expect(service.simulateTransaction(mockTx)).rejects.toThrow(TikkaSdkError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('honors per-call disableRetries', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    service.configure({ fetchClient: mockFetch as any, maxRetryAttempts: 3, retryBaseDelayMs: 1 });
    const mockTx = { toXDR: () => 'mock-xdr' };

    await expect(service.simulateTransaction(mockTx, { disableRetries: true })).rejects.toThrow(TikkaSdkError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
