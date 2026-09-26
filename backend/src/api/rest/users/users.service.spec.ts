import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import {
  IndexerService,
  IndexerUserData,
  IndexerUserHistoryItem,
} from '../../../services/indexer/indexer.service';
import { UserHistoryQueryDto } from './dto/user-history-query.dto';

/** A real, checksum-valid Stellar account address. */
const ADDRESS = 'GBZQEQYUHJSN5JCUOUS4MO2NY4HDNZAGDCOMF7Z2ZQZD3CSHJZAZ4WW3';

/** A second account, used wherever the test must not accidentally match. */
const OTHER_ADDRESS = 'GAON5T23YXAIIF54XGPZFORV7PVASERLXXFWG7JN745BZBLMIU3FICUJ';

const PROFILE: IndexerUserData = {
  address: ADDRESS,
  total_tickets_bought: 4,
  total_raffles_entered: 2,
  total_raffles_won: 1,
  total_prize_xlm: '25.0000000',
  first_seen_ledger: 1234,
  updated_at: '2026-09-01T00:00:00.000Z',
};

function historyItem(raffleId: number): IndexerUserHistoryItem {
  return {
    raffle_id: raffleId,
    status: 'finalized',
    tickets_bought: 1,
    purchased_at_ledger: 1200 + raffleId,
    purchase_tx_hash: `tx-${raffleId}`,
    prize_amount: null,
    is_winner: false,
  };
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('UsersService', () => {
  let service: UsersService;
  let indexer: jest.Mocked<Pick<IndexerService, 'getUser' | 'getUserHistory'>>;

  beforeEach(() => {
    indexer = {
      getUser: jest.fn(),
      getUserHistory: jest.fn(),
    };
    service = new UsersService(indexer as unknown as IndexerService);
  });

  /**
   * The `users` table is keyed by the canonical strkey, and the indexer resolves
   * it with an exact string match. Every variant spelling of the same account
   * therefore has to be reduced to one string before it leaves the backend.
   */
  describe('address canonicalisation', () => {
    it.each([
      ['exact', ADDRESS],
      ['surrounding whitespace', `  ${ADDRESS}  `],
      ['a leading tab and trailing newline', `\t${ADDRESS}\n`],
      ['lower case', ADDRESS.toLowerCase()],
      ['mixed case', ADDRESS.slice(0, 20).toLowerCase() + ADDRESS.slice(20)],
    ])('resolves %s to the canonical strkey', async (_label, input) => {
      indexer.getUser.mockResolvedValue(PROFILE);

      await service.getByAddress(input);

      expect(indexer.getUser).toHaveBeenCalledWith(ADDRESS);
    });

    it('does not treat a different account as equivalent', async () => {
      indexer.getUser.mockResolvedValue(null);

      await expect(service.getByAddress(OTHER_ADDRESS)).rejects.toThrow(NotFoundException);
      expect(indexer.getUser).toHaveBeenCalledWith(OTHER_ADDRESS);
    });

    it.each([
      ['an empty string', ''],
      ['only whitespace', '   '],
      ['a contract address', `C${ADDRESS.slice(1)}`],
      ['a secret key', `S${ADDRESS.slice(1)}`],
      ['one character short', ADDRESS.slice(0, -1)],
      ['one character long', `${ADDRESS}A`],
      ['a character outside the base32 alphabet', `${ADDRESS.slice(0, -1)}0`],
      ['a digit below the base32 alphabet', `${ADDRESS.slice(0, -1)}1`],
      ['a lower-case-only fragment', 'not-an-address'],
    ])('rejects %s without touching the indexer', async (_label, input) => {
      await expect(service.getByAddress(input)).rejects.toThrow(BadRequestException);
      expect(indexer.getUser).not.toHaveBeenCalled();
    });

    it('rejects a non-string address', async () => {
      await expect(service.getByAddress(undefined as unknown as string)).rejects.toThrow(
        BadRequestException,
      );
      expect(indexer.getUser).not.toHaveBeenCalled();
    });

    it('does not echo the rejected value back in the error message', async () => {
      const rejected = 'G<script>alert(1)</script>';

      await expect(service.getByAddress(rejected)).rejects.toThrow(
        expect.objectContaining({
          message: 'address must be a Stellar account address',
        }),
      );
    });
  });

  describe('getByAddress', () => {
    it('returns the profile reported by the indexer', async () => {
      indexer.getUser.mockResolvedValue(PROFILE);

      await expect(service.getByAddress(ADDRESS)).resolves.toBe(PROFILE);
    });

    it('throws 404 when the indexer has no such user', async () => {
      indexer.getUser.mockResolvedValue(null);

      await expect(service.getByAddress(ADDRESS)).rejects.toThrow(
        new NotFoundException(`User ${ADDRESS} not found`),
      );
    });

    it('reports the canonical address in the 404, not the spelling that was requested', async () => {
      indexer.getUser.mockResolvedValue(null);

      await expect(service.getByAddress(ADDRESS.toLowerCase())).rejects.toThrow(
        new NotFoundException(`User ${ADDRESS} not found`),
      );
    });
  });

  describe('getHistory', () => {
    it('returns the paginated history and forwards limit and offset', async () => {
      const expected = { items: [historyItem(1), historyItem(2)], total: 2 };
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory.mockResolvedValue(expected);
      const query: UserHistoryQueryDto = { limit: 20, offset: 40 };

      await expect(service.getHistory(ADDRESS, query)).resolves.toBe(expected);
      expect(indexer.getUserHistory).toHaveBeenCalledWith(ADDRESS, 20, 40);
    });

    it('looks the user up in canonical form before reading history', async () => {
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory.mockResolvedValue({ items: [], total: 0 });

      await service.getHistory(` ${ADDRESS.toLowerCase()} `, { limit: 10, offset: 0 });

      expect(indexer.getUser).toHaveBeenCalledWith(ADDRESS);
      expect(indexer.getUserHistory).toHaveBeenCalledWith(ADDRESS, 10, 0);
    });

    it('throws 404 and never reads history when the user does not exist', async () => {
      indexer.getUser.mockResolvedValue(null);

      await expect(service.getHistory(ADDRESS, { limit: 20, offset: 0 })).rejects.toThrow(
        NotFoundException,
      );
      expect(indexer.getUserHistory).not.toHaveBeenCalled();
    });

    it('rejects a malformed address before the existence check', async () => {
      await expect(service.getHistory('nope', { limit: 20, offset: 0 })).rejects.toThrow(
        BadRequestException,
      );
      expect(indexer.getUser).not.toHaveBeenCalled();
      expect(indexer.getUserHistory).not.toHaveBeenCalled();
    });
  });

  describe('getHistoryAsCsvStream', () => {
    it('throws 404 when the user does not exist', async () => {
      indexer.getUser.mockResolvedValue(null);

      await expect(service.getHistoryAsCsvStream(ADDRESS)).rejects.toThrow(NotFoundException);
      expect(indexer.getUserHistory).not.toHaveBeenCalled();
    });

    it('rejects a malformed address', async () => {
      await expect(service.getHistoryAsCsvStream('nope')).rejects.toThrow(BadRequestException);
    });

    it('writes a header row followed by one row per history item', async () => {
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory.mockResolvedValue({ items: [historyItem(1)], total: 1 });

      const csv = await readStream(await service.getHistoryAsCsvStream(ADDRESS));

      // `csv-stringify` renders `false` as an empty cell, so a non-winner is
      // indistinguishable from a missing prize_amount. That is the current wire
      // format; this test pins it rather than changing it.
      expect(csv).toBe(
        [
          'raffle_id,tickets_bought,purchased_at_ledger,is_winner,prize_amount',
          '1,1,1201,,',
          '',
        ].join('\n'),
      );
    });

    it('reads history in canonical form', async () => {
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory.mockResolvedValue({ items: [], total: 0 });

      await readStream(await service.getHistoryAsCsvStream(ADDRESS.toLowerCase()));

      expect(indexer.getUser).toHaveBeenCalledWith(ADDRESS);
      expect(indexer.getUserHistory).toHaveBeenCalledWith(ADDRESS, 100, 0);
    });

    it('stops after a page shorter than the page size', async () => {
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory.mockResolvedValueOnce({
        items: [historyItem(1), historyItem(2)],
        total: 2,
      });

      const csv = await readStream(await service.getHistoryAsCsvStream(ADDRESS));

      expect(indexer.getUserHistory).toHaveBeenCalledTimes(1);
      expect(csv.trim().split('\n')).toHaveLength(3);
    });

    it('pages until a short page is returned', async () => {
      const fullPage = Array.from({ length: 100 }, (_unused, index) => historyItem(index + 1));
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory
        .mockResolvedValueOnce({ items: fullPage, total: 101 })
        .mockResolvedValueOnce({ items: [historyItem(101)], total: 101 });

      const csv = await readStream(await service.getHistoryAsCsvStream(ADDRESS));

      expect(indexer.getUserHistory).toHaveBeenNthCalledWith(1, ADDRESS, 100, 0);
      expect(indexer.getUserHistory).toHaveBeenNthCalledWith(2, ADDRESS, 100, 100);
      expect(csv.trim().split('\n')).toHaveLength(102);
    });

    it('emits only the header when the user has no history', async () => {
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory.mockResolvedValue({ items: [], total: 0 });

      const csv = await readStream(await service.getHistoryAsCsvStream(ADDRESS));

      expect(csv.trim().split('\n')).toEqual([
        'raffle_id,tickets_bought,purchased_at_ledger,is_winner,prize_amount',
      ]);
      expect(indexer.getUserHistory).toHaveBeenCalledTimes(1);
    });

    it('renders a prize amount when the user won', async () => {
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory.mockResolvedValue({
        items: [{ ...historyItem(7), is_winner: true, prize_amount: '12.5000000' }],
        total: 1,
      });

      const csv = await readStream(await service.getHistoryAsCsvStream(ADDRESS));

      expect(csv).toContain('7,1,1207,1,12.5000000');
    });

    it('aborts the download when a page fetch fails', async () => {
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory.mockRejectedValue(new Error('indexer unreachable'));

      const stream = await service.getHistoryAsCsvStream(ADDRESS);

      await expect(readStream(stream)).rejects.toThrow('indexer unreachable');
    });

    it('aborts the download when a later page fails', async () => {
      const fullPage = Array.from({ length: 100 }, (_unused, index) => historyItem(index + 1));
      indexer.getUser.mockResolvedValue(PROFILE);
      indexer.getUserHistory
        .mockResolvedValueOnce({ items: fullPage, total: 101 })
        .mockRejectedValueOnce(new Error('indexer unreachable'));

      const stream = await service.getHistoryAsCsvStream(ADDRESS);

      await expect(readStream(stream)).rejects.toThrow('indexer unreachable');
    });
  });
});
