/**
 * Read-only entry point smoke tests (#813)
 *
 * Verifies:
 * 1. `ReadOnlyRaffleService` and `ReadOnlyUserService` can be imported from
 *    the read-only barrel (src/index.read.ts) without pulling in signing code.
 * 2. `getAll` and `getById` are callable and return typed responses.
 * 3. `getProfile` and `getHistory` are callable and return typed responses.
 * 4. Signing-only symbols (`WalletAdapter`, `TransactionLifecycle`) are NOT
 *    exported from the read-only barrel.
 */

// Import exclusively from the read barrel — no cross-barrel leakage.
import {
  ReadOnlyRaffleService,
  ReadOnlyUserService,
  RpcService,
  resolveNetworkConfig,
  ContractFn,
  RaffleStatus,
} from '../index.read';

// --- Signing symbols must NOT be exported from the read barrel ---
// TypeScript will error at build-time if these are accidentally re-exported;
// at runtime we verify the named export is absent.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const readBarrel = require('../index.read');

describe('@tikka/sdk/read — entry point', () => {
  it('exports ReadOnlyRaffleService', () => {
    expect(ReadOnlyRaffleService).toBeDefined();
    expect(typeof ReadOnlyRaffleService).toBe('function'); // class
  });

  it('exports ReadOnlyUserService', () => {
    expect(ReadOnlyUserService).toBeDefined();
    expect(typeof ReadOnlyUserService).toBe('function');
  });

  it('exports read-only network helpers', () => {
    expect(RpcService).toBeDefined();
    expect(resolveNetworkConfig).toBeDefined();
    expect(ContractFn).toBeDefined();
    expect(RaffleStatus).toBeDefined();
  });

  it('does NOT export WalletAdapter', () => {
    expect(readBarrel.WalletAdapter).toBeUndefined();
  });

  it('does NOT export TransactionLifecycle', () => {
    expect(readBarrel.TransactionLifecycle).toBeUndefined();
  });

  it('does NOT export ContractService', () => {
    expect(readBarrel.ContractService).toBeUndefined();
  });

  it('does NOT export signing wallet adapters', () => {
    expect(readBarrel.FreighterAdapter).toBeUndefined();
    expect(readBarrel.XBullAdapter).toBeUndefined();
    expect(readBarrel.AlbedoAdapter).toBeUndefined();
  });
});

describe('ReadOnlyRaffleService', () => {
  let rpcService: jest.Mocked<RpcService>;
  let service: ReadOnlyRaffleService;

  const networkConfig = resolveNetworkConfig('testnet');

  beforeEach(() => {
    rpcService = {
      getServer: jest.fn().mockReturnValue({
        getAccount: jest.fn().mockResolvedValue({
          accountId: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          sequenceNumber: () => '0',
          incrementSequenceNumber: jest.fn(),
        }),
      }),
      simulateTransaction: jest.fn(),
    } as unknown as jest.Mocked<RpcService>;

    service = new ReadOnlyRaffleService(rpcService, networkConfig);
  });

  it('has getAll method', () => {
    expect(typeof service.getAll).toBe('function');
  });

  it('has getById method', () => {
    expect(typeof service.getById).toBe('function');
  });

  it('getAll returns ContractResponse with number[] on success', async () => {
    // Mock a successful simulate response returning an empty list
    rpcService.simulateTransaction.mockResolvedValue({
      result: { retval: { switch: () => ({ name: 'scvVec' }), vec: () => [] } as any },
      latestLedger: 100,
    } as any);

    // We only test the method signature — actual XDR parsing is integration-tested.
    // Here we confirm the call does not throw for a happy-path mock.
    const spy = jest.spyOn(service as any, 'simulate').mockResolvedValue([1, 2, 3]);
    const result = await service.getAll();

    expect(result.success).toBe(true);
    expect(Array.isArray(result.value)).toBe(true);
    spy.mockRestore();
  });

  it('getById returns ContractResponse with RaffleData on success', async () => {
    const mockRaw = {
      creator: 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36',
      status: 0,
      ticket_price: '1000000',
      max_tickets: 100,
      tickets_sold: 10,
      end_time: 1700000000,
      asset: 'XLM',
      allow_multiple: false,
      metadata_cid: '',
    };

    const spy = jest.spyOn(service as any, 'simulate').mockResolvedValue(mockRaw);
    const result = await service.getById(1);

    expect(result.success).toBe(true);
    expect(result.value?.raffleId).toBe(1);
    expect(result.value?.asset).toBe('XLM');
    spy.mockRestore();
  });
});

describe('ReadOnlyUserService', () => {
  let rpcService: jest.Mocked<RpcService>;
  let service: ReadOnlyUserService;

  const networkConfig = resolveNetworkConfig('testnet');
  const TEST_ADDRESS = 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36';

  beforeEach(() => {
    rpcService = {
      getServer: jest.fn().mockReturnValue({
        getAccount: jest.fn().mockResolvedValue({
          accountId: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          sequenceNumber: () => '0',
          incrementSequenceNumber: jest.fn(),
        }),
      }),
      simulateTransaction: jest.fn(),
    } as unknown as jest.Mocked<RpcService>;

    service = new ReadOnlyUserService(rpcService, networkConfig);
  });

  it('has getProfile method', () => {
    expect(typeof service.getProfile).toBe('function');
  });

  it('has getHistory method', () => {
    expect(typeof service.getHistory).toBe('function');
  });

  it('getProfile returns ContractResponse with UserParticipation', async () => {
    const mockRaw = {
      total_raffles_entered: 5,
      total_tickets_bought: 12,
      total_raffles_won: 1,
      raffle_ids: [1, 2, 3],
    };

    const spy = jest.spyOn(service as any, 'simulate').mockResolvedValue(mockRaw);
    const result = await service.getProfile(TEST_ADDRESS);

    expect(result.success).toBe(true);
    expect(result.value?.address).toBe(TEST_ADDRESS);
    expect(result.value?.totalRafflesEntered).toBe(5);
    expect(result.value?.raffleIds).toEqual([1, 2, 3]);
    spy.mockRestore();
  });

  it('getHistory returns raffle IDs', async () => {
    const mockRaw = {
      total_raffles_entered: 2,
      total_tickets_bought: 4,
      total_raffles_won: 0,
      raffle_ids: [10, 20],
    };

    const spy = jest.spyOn(service as any, 'simulate').mockResolvedValue(mockRaw);
    const result = await service.getHistory(TEST_ADDRESS);

    expect(result.success).toBe(true);
    expect(result.value).toEqual([10, 20]);
    spy.mockRestore();
  });
});
