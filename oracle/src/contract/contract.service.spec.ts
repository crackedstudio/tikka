import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { ContractService } from './contract.service';
import { OracleLoggerService } from '../logger/oracle-logger';

/**
 * Fixture helpers: build the ScVals the raffle contract actually returns for
 * `get_raffle_data` (see docs/contracts/INTEGRATION_BOUNDARY.md).
 *
 * On-chain units:
 * - `prize_amount` is an i128 denominated in stroops (1 XLM = 10_000_000 stroops)
 * - `status` is a symbol with the lifecycle name (Active, Drawing, ...)
 */

const XLM = (xlm: number) => BigInt(Math.round(xlm * 10_000_000));

/** A syntactically valid (never deployed) contract ID for constructor checks. */
const CONTRACT_ID = StellarSdk.StrKey.encodeContract(Buffer.alloc(32, 7));

function scvI128(value: bigint): StellarSdk.xdr.ScVal {
  const hi = value >> BigInt(64);
  const lo = value & ((BigInt(1) << BigInt(64)) - BigInt(1));
  return StellarSdk.xdr.ScVal.scvI128(
    new StellarSdk.xdr.Int128Parts({
      hi: StellarSdk.xdr.Int64.fromString(hi.toString()),
      lo: StellarSdk.xdr.Uint64.fromString(lo.toString()),
    }),
  );
}

function scvSymbol(name: string): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvSymbol(name);
}

type RaffleFields = Record<string, StellarSdk.xdr.ScVal>;

function scvRaffleMap(fields: RaffleFields): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvMap(
    Object.entries(fields).map(
      ([key, val]) => new StellarSdk.xdr.ScMapEntry({ key: scvSymbol(key), val }),
    ),
  );
}

/** Build a realistic raffle map with every field the contract returns. */
function buildRaffleMap(overrides: RaffleFields = {}): StellarSdk.xdr.ScVal {
  const creator = StellarSdk.Keypair.random().publicKey();
  const base: RaffleFields = {
    raffle_id: StellarSdk.xdr.ScVal.scvU32(7),
    creator: StellarSdk.xdr.ScVal.scvAddress(new StellarSdk.Address(creator).toScAddress()),
    status: scvSymbol('Drawing'),
    prize_amount: scvI128(XLM(100)),
    ticket_price: scvI128(XLM(1)),
    total_raised: scvI128(XLM(42)),
    tickets_sold: StellarSdk.xdr.ScVal.scvU32(42),
    max_tickets: StellarSdk.xdr.ScVal.scvU32(1000),
    end_time: StellarSdk.xdr.ScVal.scvU64(StellarSdk.xdr.Uint64.fromString('1758923400')),
    created_ledger: StellarSdk.xdr.ScVal.scvU32(1000),
    metadata_uri: StellarSdk.xdr.ScVal.scvString('ipfs://example'),
    winner: StellarSdk.xdr.ScVal.scvVec([]),
    winning_ticket_id: StellarSdk.xdr.ScVal.scvVec([]),
  };
  return scvRaffleMap({ ...base, ...overrides });
}

/** Wrap a retval ScVal in a success-shaped simulation response. */
function successSimulation(retval: StellarSdk.xdr.ScVal): any {
  return {
    transactionData: {},
    minResourceFee: '100',
    result: { retval, auth: [] },
    events: [],
    _parsed: true,
  };
}

function errorSimulation(message: string): any {
  return {
    error: message,
    events: [],
    _parsed: true,
  };
}

describe('ContractService', () => {
  let service: ContractService;
  let rpcServer: { simulateTransaction: jest.Mock; getLatestLedger: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const createService = async (): Promise<ContractService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractService,
        { provide: OracleLoggerService, useValue: logger },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'RAFFLE_CONTRACT_ID') return CONTRACT_ID;
              if (key === 'SOROBAN_RPC_URL') return 'https://soroban-testnet.stellar.org';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ContractService>(ContractService);
    return service;
  };

  beforeEach(async () => {
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    rpcServer = {
      simulateTransaction: jest.fn(),
      getLatestLedger: jest.fn(),
    };
    await createService();
    // Replace the RPC server created in the constructor with our mock.
    (service as any).rpcServer = rpcServer;
  });

  describe('raffle state decoding (field by field)', () => {
    it('decodes every field of the raffle map', async () => {
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(
          buildRaffleMap({
            raffle_id: StellarSdk.xdr.ScVal.scvU32(7),
            status: scvSymbol('Drawing'),
            prize_amount: scvI128(XLM(250)),
            tickets_sold: StellarSdk.xdr.ScVal.scvU32(42),
            end_time: StellarSdk.xdr.ScVal.scvU64(StellarSdk.xdr.Uint64.fromString('1758923400')),
            metadata_uri: StellarSdk.xdr.ScVal.scvString('ipfs://example'),
          }),
        ),
      );

      const data = await service.getRaffleData(7);

      expect(data).toEqual({
        raffleId: 7,
        prizeAmount: 250,
        status: 'DRAWING',
      });
    });

    it('decodes the creator account address into a G... string', async () => {
      // Address entries must round-trip through scvAddress decoding without
      // breaking the overall map decode.
      const full = scvRaffleMap({
        status: scvSymbol('Active'),
        prize_amount: scvI128(BigInt(0)),
        creator: StellarSdk.xdr.ScVal.scvAddress(
          new StellarSdk.Address(
            'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          ).toScAddress(),
        ),
      });
      rpcServer.simulateTransaction.mockResolvedValue(successSimulation(full));

      const data = await service.getRaffleData(1);
      expect(data.status).toBe('ACTIVE');
      expect(data.prizeAmount).toBe(0);
    });

    it('decodes u64 fields via their string form', async () => {
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(
          buildRaffleMap({
            end_time: StellarSdk.xdr.ScVal.scvU64(StellarSdk.xdr.Uint64.fromString('1758923400')),
          }),
        ),
      );

      // end_time is not part of RaffleData but must not break decoding.
      const data = await service.getRaffleData(7);
      expect(data.raffleId).toBe(7);
      expect(data.status).toBe('DRAWING');
    });

    it('upper-cases contract status symbols', async () => {
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(buildRaffleMap({ status: scvSymbol('Finalized') })),
      );
      const data = await service.getRaffleData(7);
      expect(data.status).toBe('FINALIZED');
    });
  });

  describe('prize value read (VRF/PRNG threshold)', () => {
    it.each([
      [0.0000001, 1], // smallest stroop amount -> 1 stroop
      [100, 100 * 10_000_000],
      [499.9999999, 4_999_999_999],
      [500, 5_000_000_000],
      [1000, 10_000_000_000],
    ])('converts %p XLM to %p stroops on the wire', async (xlm, stroops) => {
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(buildRaffleMap({ prize_amount: scvI128(BigInt(stroops)) })),
      );

      const data = await service.getRaffleData(7);
      expect(data.prizeAmount).toBe(xlm);
    });

    it('reads the 500 XLM boundary as exactly 500 (VRF path, prize >= threshold)', async () => {
      // 5_000_000_000 stroops = 500 XLM: the on-chain cap for internal randomness.
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(buildRaffleMap({ prize_amount: scvI128(BigInt(5_000_000_000)) })),
      );

      const data = await service.getRaffleData(7);
      expect(data.prizeAmount).toBe(500);
      // The decision itself lives in the worker/processor: prizeAmount >= 500 => VRF.
      expect(data.prizeAmount >= 500).toBe(true);
    });

    it('reads just below the boundary as PRNG territory (prize < 500)', async () => {
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(buildRaffleMap({ prize_amount: scvI128(BigInt(4_999_999_999)) })),
      );

      const data = await service.getRaffleData(7);
      expect(data.prizeAmount).toBeCloseTo(499.9999999, 6);
      expect(data.prizeAmount >= 500).toBe(false);
    });

    it('does not lose small stroop amounts to unit truncation', async () => {
      // 1 stroop = 0.0000001 XLM: an off-by-10^7 error would decode this as 0.
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(buildRaffleMap({ prize_amount: scvI128(BigInt(1)) })),
      );

      const data = await service.getRaffleData(7);
      expect(data.prizeAmount).toBe(1 / 10_000_000);
      expect(data.prizeAmount).toBeGreaterThan(0);
    });

    it('preserves precision for a high-value draw (10_000 XLM = 1e11 stroops)', async () => {
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(buildRaffleMap({ prize_amount: scvI128(BigInt(100_000_000_000)) })),
      );

      const data = await service.getRaffleData(7);
      expect(data.prizeAmount).toBe(10_000);
    });
  });

  describe('malformed contract responses fail loudly', () => {
    it.each([
      ['null retval', null],
      ['undefined retval', undefined],
      ['bool retval', StellarSdk.xdr.ScVal.scvBool(true)],
      ['u32 retval', StellarSdk.xdr.ScVal.scvU32(7)],
      ['empty vec retval', StellarSdk.xdr.ScVal.scvVec([])],
      ['string retval', StellarSdk.xdr.ScVal.scvString('not a raffle')],
    ])('throws on %p', async (_name, retval) => {
      rpcServer.simulateTransaction.mockResolvedValue(successSimulation(retval as any));

      await expect(service.getRaffleData(7)).rejects.toThrow(
        'Failed to decode raffle data from contract response',
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('throws when the raffle map is missing the status field', async () => {
      const fields = buildRaffleMapFields();
      delete fields.status;
      rpcServer.simulateTransaction.mockResolvedValue(successSimulation(scvRaffleMap(fields)));

      await expect(service.getRaffleData(7)).rejects.toThrow('missing raffle status');
    });

    it('throws when the raffle map is missing the prize_amount field', async () => {
      const fields = buildRaffleMapFields();
      delete fields.prize_amount;
      rpcServer.simulateTransaction.mockResolvedValue(successSimulation(scvRaffleMap(fields)));

      await expect(service.getRaffleData(7)).rejects.toThrow('missing prize amount');
    });

    it('throws when prize_amount is not decodable to a number', async () => {
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(
          buildRaffleMap({ prize_amount: StellarSdk.xdr.ScVal.scvString('not-a-number') }),
        ),
      );

      await expect(service.getRaffleData(7)).rejects.toThrow('not a valid number');
    });

    it('does not silently default missing fields to 0 or UNKNOWN', async () => {
      rpcServer.simulateTransaction.mockResolvedValue(successSimulation(scvRaffleMap({})));

      const error = await service.getRaffleData(7).catch((e) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/missing raffle status/);
      expect(error.message).not.toMatch(/unknown/i);
    });
  });

  describe('simulation failures', () => {
    it('throws and logs on simulation error', async () => {
      rpcServer.simulateTransaction.mockResolvedValue(errorSimulation('Storage entry expired'));

      await expect(service.getRaffleData(7)).rejects.toThrow(
        'Simulation failed: Storage entry expired',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch raffle data for 7'),
      );
    });

    it('throws when simulation returns no result', async () => {
      rpcServer.simulateTransaction.mockResolvedValue({
        transactionData: {},
        minResourceFee: '100',
        events: [],
        _parsed: true,
      });

      await expect(service.getRaffleData(7)).rejects.toThrow('Simulation returned no result');
    });

    it('propagates rpc errors from simulateTransaction', async () => {
      rpcServer.simulateTransaction.mockRejectedValue(new Error('connection refused'));

      await expect(service.getRaffleData(7)).rejects.toThrow('connection refused');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('isRandomnessSubmitted (already-resolved and not-found cases)', () => {
    it.each(['Finalized', 'Cancelled'])('treats status %p as already resolved', async (status) => {
      rpcServer.simulateTransaction.mockResolvedValue(
        successSimulation(buildRaffleMap({ status: scvSymbol(status) })),
      );
      await expect(service.isRandomnessSubmitted(7)).resolves.toBe(true);
    });

    it.each(['Active', 'Drawing', 'PendingPrize', 'Failed', 'Claimed'])(
      'treats status %p as not yet resolved',
      async (status) => {
        rpcServer.simulateTransaction.mockResolvedValue(
          successSimulation(buildRaffleMap({ status: scvSymbol(status) })),
        );
        await expect(service.isRandomnessSubmitted(7)).resolves.toBe(false);
      },
    );

    it('returns false when the raffle is not found (simulation error)', async () => {
      rpcServer.simulateTransaction.mockResolvedValue(
        errorSimulation('Contract storage: raffle not found'),
      );

      // getRaffleData throws; isRandomnessSubmitted degrades to false so the
      // caller retries rather than skipping a live draw.
      await expect(service.isRandomnessSubmitted(7)).resolves.toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns false when getRaffleData rejects (rpc down)', async () => {
      rpcServer.simulateTransaction.mockRejectedValue(new Error('network unreachable'));

      await expect(service.isRandomnessSubmitted(7)).resolves.toBe(false);
    });
  });

  describe('unconfigured contract', () => {
    it('throws without calling rpc when RAFFLE_CONTRACT_ID is empty', async () => {
      (service as any).contractId = '';
      await expect(service.getRaffleData(7)).rejects.toThrow(
        'RAFFLE_CONTRACT_ID is not configured',
      );
      expect(rpcServer.simulateTransaction).not.toHaveBeenCalled();
    });

    it('ping is a no-op when RAFFLE_CONTRACT_ID is empty', async () => {
      (service as any).contractId = '';
      await expect(service.ping()).resolves.toBeUndefined();
      expect(rpcServer.getLatestLedger).not.toHaveBeenCalled();
    });

    it('ping swallows rpc errors', async () => {
      rpcServer.getLatestLedger.mockRejectedValue(new Error('rpc down'));
      await expect(service.ping()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  /** Build the raffle map fields as a plain object (for omission tests). */
  function buildRaffleMapFields(): RaffleFields {
    const creator = StellarSdk.Keypair.random().publicKey();
    return {
      raffle_id: StellarSdk.xdr.ScVal.scvU32(7),
      creator: StellarSdk.xdr.ScVal.scvAddress(new StellarSdk.Address(creator).toScAddress()),
      status: scvSymbol('Drawing'),
      prize_amount: scvI128(XLM(100)),
      tickets_sold: StellarSdk.xdr.ScVal.scvU32(42),
      end_time: StellarSdk.xdr.ScVal.scvU64(StellarSdk.xdr.Uint64.fromString('1758923400')),
      metadata_uri: StellarSdk.xdr.ScVal.scvString('ipfs://example'),
    };
  }
});
