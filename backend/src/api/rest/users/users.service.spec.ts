import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { IndexerService } from '../../../services/indexer/indexer.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let indexerService: jest.Mocked<Pick<IndexerService, 'getUser'>>;
  const address = Keypair.random().publicKey();

  beforeEach(() => {
    indexerService = { getUser: jest.fn() };
    service = new UsersService(indexerService as unknown as IndexerService);
  });

  it('normalizes a Stellar address before looking up the user', async () => {
    const user = { address, total_tickets_bought: 0 };
    indexerService.getUser.mockResolvedValue(user as any);

    await expect(service.getByAddress(`  ${address.toLowerCase()}  `)).resolves.toBe(user);
    expect(indexerService.getUser).toHaveBeenCalledWith(address);
  });

  it('throws NotFoundException when the normalized address has no user', async () => {
    indexerService.getUser.mockResolvedValue(null);

    await expect(service.getByAddress(` ${address.toLowerCase()} `)).rejects.toThrow(
      NotFoundException,
    );
    expect(indexerService.getUser).toHaveBeenCalledWith(address);
  });

  it('rejects an invalid StrKey without querying the indexer', async () => {
    await expect(service.getByAddress('GINVALID')).rejects.toThrow(BadRequestException);
    expect(indexerService.getUser).not.toHaveBeenCalled();
  });
});