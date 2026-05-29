import { RpcService } from '../network/rpc.service';
import { RaffleService } from '../modules/raffle/raffle.service';
import { ContractService } from '../contract/contract.service';
import { HorizonService } from '../network/horizon.service';
import { WalletAdapter, WalletName } from '../wallet/wallet.interface';
import { xdr, nativeToScVal, TransactionBuilder, Networks, Keypair, rpc as StellarRpc } from '@stellar/stellar-sdk';

// Mock Stellar SDK rpc.assembleTransaction
jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      assembleTransaction: jest.fn().mockImplementation((tx: any) => ({
        build: () => tx,
      })),
    },
  };
});

describe('Soroban RPC Integration (Mock)', () => {
  let rpcService: RpcService;
  let raffleService: RaffleService;
  let contractService: ContractService;
  let horizonService: HorizonService;
  let mockWallet: jest.Mocked<WalletAdapter>;

  const networkConfig = {
    network: 'testnet' as any,
    rpcUrl: 'http://mock-rpc:8000',
    horizonUrl: 'http://mock-horizon:8000',
    networkPassphrase: Networks.TESTNET,
  };

  const userKeypair = Keypair.random();
  const userAddress = userKeypair.publicKey();

  beforeEach(() => {
    // 1. Setup Mock RPC Server Logic
    const mockFetch = jest.fn();
    rpcService = new RpcService(networkConfig);
    rpcService.setFetchClient(mockFetch);

    // 2. Setup Services
    horizonService = new HorizonService(networkConfig);
    // Mock loadAccount to return a dummy account
    jest.spyOn(horizonService, 'loadAccount').mockResolvedValue({
      accountId: () => userAddress,
      sequenceNumber: () => '1',
      incrementSequenceNumber: () => {},
    } as any);

    contractService = new ContractService(rpcService, horizonService, networkConfig);
    raffleService = new RaffleService(contractService);

    // 3. Setup Mock Wallet
    mockWallet = {
      name: WalletName.Freighter,
      isAvailable: jest.fn().mockReturnValue(true),
      getPublicKey: jest.fn().mockResolvedValue(userAddress),
      signTransaction: jest.fn().mockImplementation(async (txXdr) => {
        const tx = TransactionBuilder.fromXDR(txXdr, Networks.TESTNET);
        tx.sign(userKeypair);
        return { signedXdr: tx.toXDR() };
      }),
    } as any;

    contractService.setWallet(mockWallet);

    const transactionData = 'AAAAAgAAAAH...'; // Dummy string

    // Default RPC handlers
    mockFetch.mockImplementation(async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      let result: any = {};

      switch (body.method) {
        case 'getLatestLedger':
          result = { sequence: 100 };
          break;
        case 'getNetworkConfig':
          result = { friendbotUrl: '' };
          break;
        case 'simulateTransaction':
          result = {
            results: [{ retval: nativeToScVal(1) }],
            minResourceFee: '1000',
            transactionData: transactionData,
            events: [],
          };
          break;
        case 'sendTransaction':
          result = {
            hash: '1234567890abcdef',
            status: 'PENDING',
          };
          break;
        case 'getTransaction':
          result = {
            status: 'SUCCESS',
            txHash: '1234567890abcdef',
            ledger: 101,
            resultMetaXdr: 'AAAAAwAAAAAAAAAA...', // mock meta
            resultXdr: nativeToScVal(1).toXDR('base64'),
          };
          break;
        case 'getFeeStats':
          result = { 
            feeStats: { minFee: '100', suggestedFee: '150' }
          };
          break;
      }

      return {
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: body.id, result }),
      };
    });
  });

  it('should successfully execute a full create-to-confirm cycle for createRaffle', async () => {
    const params = {
      ticketPrice: '10',
      maxTickets: 100,
      endTime: Date.now() + 100000,
      asset: 'XLM',
      allowMultiple: true,
      metadataCid: 'ipfs://mock',
    };

    // Trigger the flow
    const result = await raffleService.create(params);

    // Verify expectations
    expect(result).toBeDefined();
    expect(result.transactionHash).toBe('1234567890abcdef');
    expect(result.ledger).toBe(101);

    // Verify wallet interactions
    expect(mockWallet.getPublicKey).toHaveBeenCalled();
    expect(mockWallet.signTransaction).toHaveBeenCalled();
  });

  it('should handle simulation failure', async () => {
    const mockFetch = (rpcService as any).rpcConfig.fetchClient as jest.Mock;
    mockFetch.mockImplementation(async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (body.method === 'simulateTransaction') {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: body.id,
            error: { code: -32000, message: 'Simulation failed: insufficient funds' }
          }),
        };
      }
      if (body.method === 'getFeeStats') {
        return {
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: body.id, result: { feeStats: { minFee: '100', suggestedFee: '150' } } }),
        };
      }
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: body.id, result: {} }) };
    });

    const params = {
      ticketPrice: '10',
      maxTickets: 100,
      endTime: Date.now() + 100000,
      asset: 'XLM',
      allowMultiple: true,
      metadataCid: 'ipfs://mock',
    };

    const result = await raffleService.create(params);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Simulation failed: insufficient funds');
  });

  it('should verify polling behavior on delay', async () => {
    const mockFetch = (rpcService as any).rpcConfig.fetchClient as jest.Mock;
    let pollCount = 0;

    mockFetch.mockImplementation(async (url, init) => {
      const body = JSON.parse(init.body);
      let result: any = {};

      if (body.method === 'getTransaction') {
        pollCount++;
        if (pollCount < 2) {
          result = { status: 'NOT_FOUND' };
        } else {
          result = { status: 'SUCCESS', txHash: 'abc', ledger: 105, resultXdr: nativeToScVal(1).toXDR('base64') };
        }
      } else if (body.method === 'sendTransaction') {
        result = { hash: 'abc', status: 'PENDING' };
      } else {
        result = { 
          results: [{ retval: nativeToScVal(1) }],
          minResourceFee: '1000',
          transactionData: '...',
          events: []
        };
      }

      return {
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: body.id, result }),
      };
    });

    const params = {
      ticketPrice: '1',
      maxTickets: 10,
      endTime: Date.now() + 10000,
      asset: 'XLM',
      allowMultiple: false,
      metadataCid: 'cid',
    };

    const result = await raffleService.create(params);
    expect(result.ledger).toBe(105);
    expect(pollCount).toBe(2);
  });
});
