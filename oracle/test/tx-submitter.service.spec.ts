import { Test, TestingModule } from '@nestjs/testing';
import { TxSubmitterService } from '../src/submitter/tx-submitter.service';
import { KeyService } from '../src/keys/key.service';
import { FeeEstimatorService } from '../src/submitter/fee-estimator.service';
import { ConfigService } from '@nestjs/config';

describe('TxSubmitterService', () => {
  let service: TxSubmitterService;
  let keyService: Partial<KeyService>;
  let feeEstimator: Partial<FeeEstimatorService>;

  const mockRpcFactory = () => {
    const calls: any = { sendCalls: [] };
    const rpc: any = {
      sendTransaction: jest.fn(async () => ({ hash: 'ok-hash' })),
      getTransaction: jest.fn(async () => ({ status: 'SUCCESS', ledger: 42 })),
      prepareTransaction: jest.fn(async (tx: any) => ({ prepared: true, tx })),
      simulateTransaction: jest.fn(async () => ({ result: 'ok' })),
      getAccount: jest.fn(async () => ({ accountId: 'GABC', sequence: '1' })),
    };
    return { rpc, calls };
  };

  beforeEach(async () => {
    keyService = {
      getPublicKey: jest.fn().mockResolvedValue('GTESTPUBLIC'),
      signTransaction: jest.fn().mockResolvedValue(undefined),
    };

    feeEstimator = {
      estimateFee: jest.fn().mockResolvedValue({ cappedFee: 100, priorityFee: 50, isCapped: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TxSubmitterService,
        { provide: ConfigService, useValue: { get: jest.fn().mockImplementation((k: string) => {
          if (k === 'RAFFLE_CONTRACT_ID') return 'CONTRACT_ID';
          if (k === 'SOROBAN_RPC_URL') return 'https://example.com';
          return undefined;
        }) } },
        { provide: FeeEstimatorService, useValue: feeEstimator },
        { provide: KeyService, useValue: keyService },
      ],
    }).compile();

    service = module.get<TxSubmitterService>(TxSubmitterService);
    jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

    // Inject mock RPC server
    const { rpc } = mockRpcFactory();
    (service as any).rpcServer = rpc;
  });

  it('should call KeyService.signTransaction and return success on submitRandomness', async () => {
    const randomness = { seed: 'aa', proof: 'bb' } as any;

    const res = await service.submitRandomness(1, randomness);

    expect(res.success).toBe(true);
    expect(res.txHash).toBe('ok-hash');
    expect((keyService.signTransaction as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('should retry on insufficient fee error and then succeed', async () => {
    const rpc: any = (service as any).rpcServer;

    // First call returns an object indicating insufficient fee (no hash)
    rpc.sendTransaction.mockImplementationOnce(async () => ({ error: 'tx_insufficient_fee' }));
    // Second call succeeds
    rpc.sendTransaction.mockImplementationOnce(async () => ({ hash: 'after-retry' }));

    const randomness = { seed: 'aa', proof: 'bb' } as any;
    const res = await service.submitRandomness(2, randomness);

    expect(res.success).toBe(true);
    expect(res.txHash).toBe('after-retry');
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(2);
  });

  it('should trigger failover on RPC errors', async () => {
    const rpc: any = (service as any).rpcServer;

    // Make sendTransaction throw an RPC-like error
    rpc.sendTransaction.mockImplementationOnce(async () => { throw new Error('ECONNREFUSED'); });
    // After failover the next call will succeed
    rpc.sendTransaction.mockImplementationOnce(async () => ({ hash: 'post-failover' }));

    const spyFailover = jest.spyOn(service as any, 'failoverRpc');

    const randomness = { seed: 'aa', proof: 'bb' } as any;
    const res = await service.submitRandomness(3, randomness);

    expect(spyFailover).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.txHash).toBe('post-failover');
  });

  it('should stop retrying on non-retriable invalid transaction errors', async () => {
    const rpc: any = (service as any).rpcServer;
    rpc.sendTransaction.mockImplementationOnce(async () => {
      throw new Error('transaction invalid: malformed');
    });

    const randomness = { seed: 'aa', proof: 'bb' } as any;
    const res = await service.submitRandomness(4, randomness);

    expect(res.success).toBe(false);
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(1);
  });
});
