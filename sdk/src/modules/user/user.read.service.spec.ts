import { Contract, nativeToScVal } from '@stellar/stellar-sdk';
import { ReadOnlyUserService } from './user.read.service';
import { RpcService } from '../../network/rpc.service';
import { resolveNetworkConfig } from '../../network/network.config';
import { ContractFn } from '../../contract/bindings';
import { TikkaSdkError, TikkaSdkErrorCode, UnavailableError } from '../../utils/errors';

const ANON_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ADDRESS = 'GA75VV4F2VQASYJV6F64NSQ5Z3HUYFPX252WIYX2OIZROVT4S63TGWFN';

/** Encodes the raw `get_user_participation` struct the way the node would. */
function encodeParticipation(
  ids: number[],
  counters: { entered: number; bought: number; won: number },
): unknown {
  return nativeToScVal(
    {
      total_raffles_entered: counters.entered,
      total_tickets_bought: counters.bought,
      total_raffles_won: counters.won,
      raffle_ids: ids,
    },
    {
      type: {
        total_raffles_entered: ['symbol', 'u32'],
        total_tickets_bought: ['symbol', 'u32'],
        total_raffles_won: ['symbol', 'u32'],
        raffle_ids: ['symbol', ids.map(() => 'u32')],
      } as any,
    },
  );
}

function stubAccount(): unknown {
  return {
    accountId: () => ANON_KEY,
    sequenceNumber: () => '0',
    incrementSequenceNumber: jest.fn(),
  };
}

describe('ReadOnlyUserService', () => {
  let service: ReadOnlyUserService;
  let rpcService: jest.Mocked<RpcService>;
  let getAccount: jest.Mock;

  const networkConfig = resolveNetworkConfig('testnet');

  beforeEach(() => {
    getAccount = jest.fn().mockResolvedValue(stubAccount());
    rpcService = {
      getServer: jest.fn().mockReturnValue({ getAccount }),
      simulateTransaction: jest.fn(),
    } as unknown as jest.Mocked<RpcService>;

    service = new ReadOnlyUserService(rpcService, networkConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function respondWith(retval: unknown): void {
    rpcService.simulateTransaction.mockResolvedValue({
      result: { retval },
      latestLedger: 100,
      _parsed: true,
    } as any);
  }

  describe('getProfile — decode correctness', () => {
    it('decodes every field of the participation struct', async () => {
      respondWith(encodeParticipation([1, 2, 3], { entered: 5, bought: 12, won: 1 }));

      const result = await service.getProfile(ADDRESS);

      expect(result.success).toBe(true);
      expect(result.status).toBe('SUCCESS');
      expect(result.value).toEqual({
        address: ADDRESS,
        totalRafflesEntered: 5,
        totalTicketsBought: 12,
        totalRafflesWon: 1,
        raffleIds: [1, 2, 3],
      });
    });

    it('reads participation through get_user_participation', async () => {
      const callSpy = jest.spyOn(Contract.prototype, 'call');
      respondWith(encodeParticipation([], { entered: 0, bought: 0, won: 0 }));

      await service.getProfile(ADDRESS);

      expect(callSpy).toHaveBeenCalledWith(ContractFn.GET_USER_PARTICIPATION, expect.anything());
      callSpy.mockRestore();
    });

    it('returns a well-formed zero profile for an address with no participation', async () => {
      respondWith(encodeParticipation([], { entered: 0, bought: 0, won: 0 }));

      const result = await service.getProfile(ADDRESS);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({
        address: ADDRESS,
        totalRafflesEntered: 0,
        totalTicketsBought: 0,
        totalRafflesWon: 0,
        raffleIds: [],
      });
    });

    it('accepts 64-bit counters and exposes them as numbers', async () => {
      respondWith(
        nativeToScVal(
          {
            total_raffles_entered: BigInt(5),
            total_tickets_bought: BigInt(12),
            total_raffles_won: BigInt(1),
            raffle_ids: [2, 4],
          },
          {
            type: {
              total_raffles_entered: ['symbol', 'u64'],
              total_tickets_bought: ['symbol', 'u64'],
              total_raffles_won: ['symbol', 'u64'],
              raffle_ids: ['symbol', ['u32', 'u32']],
            } as any,
          },
        ),
      );

      const result = await service.getProfile(ADDRESS);

      expect(result.value!.totalRafflesEntered).toBe(5);
      expect(result.value!.totalTicketsBought).toBe(12);
      expect(result.value!.raffleIds).toEqual([2, 4]);
    });
  });

  describe('getProfile — address without a participation record', () => {
    it('returns a zero profile when the contract panics with RAFFLE_NOT_FOUND', async () => {
      rpcService.simulateTransaction.mockResolvedValue({
        error: 'Error(Contract, #1)',
        latestLedger: 100,
      } as any);

      const result = await service.getProfile(ADDRESS);

      expect(result.success).toBe(true);
      expect(result.status).toBe('SUCCESS');
      expect(result.value).toEqual({
        address: ADDRESS,
        totalRafflesEntered: 0,
        totalTicketsBought: 0,
        totalRafflesWon: 0,
        raffleIds: [],
      });
    });

    it('returns a zero profile when the contract returns nothing', async () => {
      // `nativeToScVal(null)` is an ScVal void — what an `Option::None` decodes to.
      respondWith(nativeToScVal(null));

      const result = await service.getProfile(ADDRESS);

      expect(result.success).toBe(true);
      expect(result.value).toEqual({
        address: ADDRESS,
        totalRafflesEntered: 0,
        totalTicketsBought: 0,
        totalRafflesWon: 0,
        raffleIds: [],
      });
    });
  });

  describe('getProfile — malformed responses and RPC failures', () => {
    it('rejects a non-struct contract response with a typed InvalidResponse error', async () => {
      respondWith(nativeToScVal('not a participation struct'));

      const error = (await service
        .getProfile(ADDRESS)
        .catch((caught: unknown) => caught)) as TikkaSdkError;

      expect(error).toBeInstanceOf(TikkaSdkError);
      expect(error).not.toBeInstanceOf(TypeError);
      expect(error.code).toBe(TikkaSdkErrorCode.InvalidResponse);
      expect(error.message).toContain(ADDRESS);
      expect(error.message).toContain('string');
    });

    it('rejects a response without a raffle_ids array', async () => {
      respondWith(
        nativeToScVal(
          { total_raffles_entered: 1, total_tickets_bought: 1, total_raffles_won: 0 },
          {
            type: {
              total_raffles_entered: ['symbol', 'u32'],
              total_tickets_bought: ['symbol', 'u32'],
              total_raffles_won: ['symbol', 'u32'],
            } as any,
          },
        ),
      );

      await expect(service.getProfile(ADDRESS)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.InvalidResponse,
      });
    });

    it('rejects a response missing a counter instead of defaulting it to zero', async () => {
      respondWith(
        nativeToScVal(
          { total_raffles_entered: 1, raffle_ids: [] },
          {
            type: {
              total_raffles_entered: ['symbol', 'u32'],
              raffle_ids: ['symbol', []],
            } as any,
          },
        ),
      );

      await expect(service.getProfile(ADDRESS)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.InvalidResponse,
        message: expect.stringContaining('total_tickets_bought'),
      });
    });

    it('rejects non-numeric counters instead of returning a partial profile', async () => {
      respondWith(
        nativeToScVal(
          {
            total_raffles_entered: 'five',
            total_tickets_bought: 1,
            total_raffles_won: 0,
            raffle_ids: [],
          },
          {
            type: {
              total_raffles_entered: ['symbol', 'string'],
              total_tickets_bought: ['symbol', 'u32'],
              total_raffles_won: ['symbol', 'u32'],
              raffle_ids: ['symbol', []],
            } as any,
          },
        ),
      );

      await expect(service.getProfile(ADDRESS)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.InvalidResponse,
      });
    });

    it('rejects an invalid public key before contacting the network', async () => {
      await expect(service.getProfile('not-a-key')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.ValidationError,
      });
      expect(rpcService.simulateTransaction).not.toHaveBeenCalled();
    });

    it('propagates an RPC failure as a typed error', async () => {
      rpcService.simulateTransaction.mockRejectedValue(new UnavailableError('rpc down'));

      await expect(service.getProfile(ADDRESS)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unavailable,
      });
    });

    it('still simulates when the anonymous account cannot be loaded', async () => {
      getAccount.mockRejectedValue(new Error('account not found'));
      respondWith(encodeParticipation([7], { entered: 1, bought: 2, won: 0 }));

      const result = await service.getProfile(ADDRESS);

      expect(result.value!.raffleIds).toEqual([7]);
      expect(getAccount).toHaveBeenCalledWith(ANON_KEY);
    });
  });

  describe('getHistory', () => {
    it('returns the participation raffle IDs', async () => {
      respondWith(encodeParticipation([10, 20], { entered: 2, bought: 4, won: 0 }));

      const result = await service.getHistory(ADDRESS);

      expect(result).toEqual({ success: true, value: [10, 20] });
    });

    it('rejects an invalid public key', async () => {
      await expect(service.getHistory('nope')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.ValidationError,
      });
    });

    it('propagates RPC failures', async () => {
      rpcService.simulateTransaction.mockRejectedValue(new UnavailableError('rpc down'));

      await expect(service.getHistory(ADDRESS)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unavailable,
      });
    });
  });
});
