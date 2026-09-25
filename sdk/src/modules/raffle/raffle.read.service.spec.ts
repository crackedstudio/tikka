import { Contract, nativeToScVal } from '@stellar/stellar-sdk';
import { ReadOnlyRaffleService } from './raffle.read.service';
import { RpcService } from '../../network/rpc.service';
import { resolveNetworkConfig } from '../../network/network.config';
import { ContractFn, RaffleStatus } from '../../contract/bindings';
import { TikkaSdkError, TikkaSdkErrorCode, UnavailableError } from '../../utils/errors';

const ANON_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const CREATOR = 'GA75VV4F2VQASYJV6F64NSQ5Z3HUYFPX252WIYX2OIZROVT4S63TGWFN';
const WINNER = 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36';

/** Every field `RaffleData` exposes, so a dropped field cannot hide. */
const RAFFLE_DATA_KEYS = [
  'allowMultiple',
  'asset',
  'assetIssuer',
  'creator',
  'endTime',
  'maxTickets',
  'metadataCid',
  'prizeAmount',
  'raffleId',
  'status',
  'ticketPrice',
  'ticketsSold',
  'winner',
  'winningTicketId',
];

/**
 * Wire schema of the raw `get_raffle_data` struct (snake_case, on-chain types).
 * Declaring it here means the decode assertions below run against a real XDR
 * round-trip instead of a mock of `scValToNative`.
 */
const RAFFLE_SCHEMA: Record<string, [string, unknown]> = {
  creator: ['symbol', 'string'],
  status: ['symbol', 'u32'],
  ticket_price: ['symbol', 'i128'],
  max_tickets: ['symbol', 'u32'],
  tickets_sold: ['symbol', 'u32'],
  end_time: ['symbol', 'u64'],
  asset: ['symbol', 'string'],
  asset_issuer: ['symbol', 'string'],
  allow_multiple: ['symbol', 'bool'],
  metadata_cid: ['symbol', 'string'],
  winner: ['symbol', 'string'],
  winning_ticket_id: ['symbol', 'u32'],
  prize_amount: ['symbol', 'i128'],
};

/** Encodes a raw contract struct the way the Soroban node returns it. */
function encodeRaffle(raw: Record<string, unknown>): unknown {
  return nativeToScVal(raw, { type: RAFFLE_SCHEMA as any });
}

/** Minimal account stub so the service can build its simulation transaction. */
function stubAccount(): unknown {
  return {
    accountId: () => ANON_KEY,
    sequenceNumber: () => '0',
    incrementSequenceNumber: jest.fn(),
  };
}

describe('ReadOnlyRaffleService', () => {
  let service: ReadOnlyRaffleService;
  let rpcService: jest.Mocked<RpcService>;
  let getAccount: jest.Mock;

  const networkConfig = resolveNetworkConfig('testnet');

  beforeEach(() => {
    getAccount = jest.fn().mockResolvedValue(stubAccount());
    rpcService = {
      getServer: jest.fn().mockReturnValue({ getAccount }),
      simulateTransaction: jest.fn(),
    } as unknown as jest.Mocked<RpcService>;

    service = new ReadOnlyRaffleService(rpcService, networkConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** A successful simulation returning `retval` as the contract's return value. */
  function respondWith(retval: unknown): void {
    rpcService.simulateTransaction.mockResolvedValue({
      result: { retval },
      latestLedger: 100,
      _parsed: true,
    } as any);
  }

  describe('getById — found entity', () => {
    it('decodes every field of the contract struct', async () => {
      respondWith(
        encodeRaffle({
          creator: CREATOR,
          status: 2,
          ticket_price: BigInt(100000000),
          max_tickets: 100,
          tickets_sold: 50,
          end_time: BigInt(1711545600),
          asset: 'XLM',
          asset_issuer: '',
          allow_multiple: true,
          metadata_cid: 'QmTestCid',
          winner: WINNER,
          winning_ticket_id: 7,
          prize_amount: BigInt(4500),
        }),
      );

      const result = await service.getById(42);

      expect(result.success).toBe(true);
      expect(result.status).toBe('SUCCESS');

      // Field by field, so a silent field misalignment shows up here.
      expect(result.value!.raffleId).toBe(42);
      expect(result.value!.creator).toBe(CREATOR);
      expect(result.value!.status).toBe(RaffleStatus.FINALIZED);
      expect(result.value!.ticketPrice).toBe('100000000');
      expect(result.value!.maxTickets).toBe(100);
      expect(result.value!.ticketsSold).toBe(50);
      expect(result.value!.endTime).toBe(1711545600 * 1000);
      expect(result.value!.asset).toBe('XLM');
      expect(result.value!.assetIssuer).toBeUndefined();
      expect(result.value!.allowMultiple).toBe(true);
      expect(result.value!.metadataCid).toBe('QmTestCid');
      expect(result.value!.winner).toBe(WINNER);
      expect(result.value!.winningTicketId).toBe(7);
      expect(result.value!.prizeAmount).toBe('4500');
      expect(Object.keys(result.value!).sort()).toEqual(RAFFLE_DATA_KEYS);
    });

    it('reads the raffle through get_raffle_data', async () => {
      const callSpy = jest.spyOn(Contract.prototype, 'call');
      respondWith(
        encodeRaffle({ creator: CREATOR, status: 0, ticket_price: BigInt(1), max_tickets: 1 }),
      );

      await service.getById(1);

      expect(rpcService.simulateTransaction).toHaveBeenCalledTimes(1);
      expect(callSpy).toHaveBeenCalledWith(ContractFn.GET_RAFFLE_DATA, expect.anything());
    });

    it('leaves the winner fields undefined for a raffle that has not been drawn', async () => {
      respondWith(
        encodeRaffle({
          creator: CREATOR,
          status: 0,
          ticket_price: BigInt(500),
          max_tickets: 10,
          tickets_sold: 0,
          end_time: BigInt(1711545600),
          asset: 'USDC',
          asset_issuer: 'GISSUER',
          allow_multiple: false,
          metadata_cid: '',
        }),
      );

      const result = await service.getById(1);

      expect(result.value!.status).toBe(RaffleStatus.OPEN);
      expect(result.value!.ticketPrice).toBe('500');
      expect(result.value!.assetIssuer).toBe('GISSUER');
      expect(result.value!.allowMultiple).toBe(false);
      expect(result.value!.winner).toBeUndefined();
      expect(result.value!.winningTicketId).toBeUndefined();
      expect(result.value!.prizeAmount).toBeUndefined();
    });

    it('applies documented defaults when the struct omits optional fields', async () => {
      respondWith(
        encodeRaffle({ creator: CREATOR, status: 3, ticket_price: BigInt(7), max_tickets: 3 }),
      );

      const result = await service.getById(9);

      expect(result.value!.status).toBe(RaffleStatus.CANCELLED);
      expect(result.value!.ticketsSold).toBe(0);
      expect(result.value!.endTime).toBe(0);
      expect(result.value!.asset).toBe('XLM');
      expect(result.value!.metadataCid).toBe('');
    });

    it('falls back to an anonymous account when the network account cannot be loaded', async () => {
      getAccount.mockRejectedValue(new Error('account not found'));
      respondWith(
        encodeRaffle({ creator: CREATOR, status: 0, ticket_price: BigInt(1), max_tickets: 1 }),
      );

      const result = await service.getById(1);

      expect(result.success).toBe(true);
      expect(getAccount).toHaveBeenCalledWith(ANON_KEY);
    });

    const statusCases: Array<[number, RaffleStatus]> = [
      [0, RaffleStatus.OPEN],
      [1, RaffleStatus.DRAWING],
      [2, RaffleStatus.FINALIZED],
      [3, RaffleStatus.CANCELLED],
      [99, RaffleStatus.OPEN],
    ];

    it.each(statusCases)(
      'maps contract status %i onto %s',
      async (contractStatus: number, expected: RaffleStatus) => {
        respondWith(
          encodeRaffle({
            creator: CREATOR,
            status: contractStatus,
            ticket_price: BigInt(1),
            max_tickets: 1,
          }),
        );

        const result = await service.getById(1);

        expect(result.value!.status).toBe(expected);
      },
    );
  });

  describe('getById — not-found entity', () => {
    it('returns a distinguishable result when the contract reports RAFFLE_NOT_FOUND', async () => {
      rpcService.simulateTransaction.mockResolvedValue({
        error: 'Error(Contract, #1)',
        latestLedger: 100,
      } as any);

      const result = await service.getById(999);

      expect(result.success).toBe(false);
      expect(result.status).toBe('ERROR');
      expect(result.error).toBe(TikkaSdkErrorCode.RaffleNotFound);
      expect(result.value).toBeUndefined();
    });

    it('returns a distinguishable result when the contract returns nothing', async () => {
      // `nativeToScVal(null)` is an ScVal void — what an `Option::None` decodes to.
      respondWith(nativeToScVal(null));

      const result = await service.getById(999);

      expect(result.success).toBe(false);
      expect(result.status).toBe('ERROR');
      expect(result.error).toBe(TikkaSdkErrorCode.RaffleNotFound);
      expect(result.value).toBeUndefined();
    });

    it('still raises other contract errors as typed errors', async () => {
      rpcService.simulateTransaction.mockResolvedValue({
        error: 'Error(Contract, #35)',
        latestLedger: 100,
      } as any);

      await expect(service.getById(1)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.RaffleEnded,
      });
    });

    it('raises unrecognised simulation failures as typed errors', async () => {
      rpcService.simulateTransaction.mockResolvedValue({
        error: 'Something unexpected happened',
        latestLedger: 100,
      } as any);

      await expect(service.getById(1)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.SimulationFailed,
      });
    });
  });

  describe('getById — malformed responses and RPC failures', () => {
    it('rejects a non-struct contract response with a typed InvalidResponse error', async () => {
      respondWith(nativeToScVal('not a raffle struct'));

      const error = (await service.getById(1).catch((caught: unknown) => caught)) as TikkaSdkError;

      expect(error).toBeInstanceOf(TikkaSdkError);
      expect(error).not.toBeInstanceOf(TypeError);
      expect(error.code).toBe(TikkaSdkErrorCode.InvalidResponse);
      expect(error.message).toContain('raffle 1');
      expect(error.message).toContain('string');
    });

    it('rejects a vector response with a typed InvalidResponse error', async () => {
      respondWith(nativeToScVal([1, 2], { type: ['u32', 'u32'] }));

      const error = (await service.getById(1).catch((caught: unknown) => caught)) as TikkaSdkError;

      expect(error).toBeInstanceOf(TikkaSdkError);
      expect(error.code).toBe(TikkaSdkErrorCode.InvalidResponse);
      expect(error.message).toContain('array');
    });

    it('rejects a success response that carries no return value', async () => {
      rpcService.simulateTransaction.mockResolvedValue({ result: {}, latestLedger: 1 } as any);

      await expect(service.getById(1)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.SimulationFailed,
      });
    });

    it('propagates an RPC failure as a typed error', async () => {
      rpcService.simulateTransaction.mockRejectedValue(new UnavailableError('rpc down'));

      await expect(service.getById(1)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unavailable,
      });
    });
  });

  describe('getAll', () => {
    it('decodes the raffle ID vector', async () => {
      respondWith(nativeToScVal([4, 8, 15], { type: ['u32', 'u32', 'u32'] }));

      const result = await service.getAll();

      expect(result).toEqual({ success: true, status: 'SUCCESS', value: [4, 8, 15] });
    });

    it('returns an empty list when no raffles exist', async () => {
      respondWith(nativeToScVal([]));

      const result = await service.getAll();

      expect(result.success).toBe(true);
      expect(result.value).toEqual([]);
    });
  });
});
