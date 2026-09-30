import { Keypair } from '@stellar/stellar-sdk';
import { CacheService } from '../cache/cache.service';
import { UserProcessor } from './user.processor';

describe('UserProcessor', () => {
  const address = Keypair.random().publicKey();
  let processor: UserProcessor;
  let dataSource: { createQueryRunner: jest.Mock };
  let queryRunner: any;
  let manager: any;
  let insertBuilder: any;
  let updateBuilder: any;
  let cacheService: jest.Mocked<Pick<CacheService, 'invalidateUserProfile' | 'invalidateRaffleDetail'>>;

  beforeEach(() => {
    insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    manager = {
      createQueryBuilder: jest.fn()
        .mockReturnValueOnce(insertBuilder)
        .mockReturnValueOnce(updateBuilder),
      findOne: jest.fn().mockResolvedValue({ lastTxHash: null }),
    };
    queryRunner = {
      manager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
    };
    dataSource = { createQueryRunner: jest.fn().mockReturnValue(queryRunner) };
    cacheService = {
      invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
      invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
    };
    processor = new UserProcessor(dataSource as never, cacheService as never);
  });

  it('upserts case and whitespace variants under the normalized address', async () => {
    await processor.handleTicketPurchased(
      7,
      `  ${address.toLowerCase()}  `,
      2,
      100,
      'tx-hash',
    );

    expect(insertBuilder.values).toHaveBeenCalledWith({
      address,
      firstSeenLedger: 100,
      lastTxHash: null,
    });
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ where: { address } }),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(expect.any(String), [address, 7, 'tx-hash']);
    expect(updateBuilder.where).toHaveBeenCalledWith('address = :buyer', { buyer: address });
  });

  it('rejects an invalid StrKey before starting a database transaction', async () => {
    await expect(
      processor.handleTicketPurchased(7, 'GINVALID', 2, 100, 'tx-hash'),
    ).rejects.toThrow('Invalid Stellar account address');

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});