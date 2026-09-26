import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeStellarAddress } from '@tikka/types/address';
import {
  IndexerService,
  IndexerUserData,
  IndexerUserHistoryResponse,
} from '../../../services/indexer/indexer.service';
import { UserHistoryQueryDto } from './dto/user-history-query.dto';
import { stringify } from 'csv-stringify';
import { PassThrough } from 'stream';

@Injectable()
export class UsersService {
  constructor(private readonly indexerService: IndexerService) {}

  /** Get user profile by Stellar address. */
  async getByAddress(address: string): Promise<IndexerUserData> {
    const normalizedAddress = this.normalizeAddress(address);
    const user = await this.indexerService.getUser(normalizedAddress);
    if (!user) {
      throw new NotFoundException(`User ${normalizedAddress} not found`);
    }
    return user;
  }

  /** Get paginated raffle participation history for a user. */
  async getHistory(
    address: string,
    query: UserHistoryQueryDto,
  ): Promise<IndexerUserHistoryResponse> {
    const normalizedAddress = this.normalizeAddress(address);
    // Ensure user exists before fetching history
    const user = await this.indexerService.getUser(normalizedAddress);
    if (!user) {
      throw new NotFoundException(`User ${normalizedAddress} not found`);
    }
    return this.indexerService.getUserHistory(normalizedAddress, query.limit, query.offset);
  }

  /**
   * Stream the full history for a user as a CSV file.
   * Columns: raffle_id, tickets_bought, purchased_at_ledger, is_winner, prize_amount
   */
  async getHistoryAsCsvStream(address: string): Promise<PassThrough> {
    const normalizedAddress = this.normalizeAddress(address);
    const user = await this.indexerService.getUser(normalizedAddress);
    if (!user) {
      throw new NotFoundException(`User ${normalizedAddress} not found`);
    }

    const stringifier = stringify({
      header: true,
      columns: ['raffle_id', 'tickets_bought', 'purchased_at_ledger', 'is_winner', 'prize_amount'],
    });

    // Stream generation in the background
    (async () => {
      try {
        let offset = 0;
        const limit = 100;

        while (true) {
          const { items } = await this.indexerService.getUserHistory(normalizedAddress, limit, offset);
          if (items.length === 0) {
            break;
          }

          for (const item of items) {
            stringifier.write([
              item.raffle_id,
              item.tickets_bought,
              item.purchased_at_ledger,
              item.is_winner,
              item.prize_amount ?? '',
            ]);
          }

          if (items.length < limit) {
            break;
          }

          offset += limit;
        }

        stringifier.end();
      } catch (err) {
        stringifier.destroy(err as Error);
      }
    })();

    // Need to return something fastify reply can stream from
    const passThrough = new PassThrough();
    stringifier.pipe(passThrough);

    return passThrough;
  }

  private normalizeAddress(address: string): string {
    try {
      return normalizeStellarAddress(address);
    } catch {
      throw new BadRequestException('Invalid Stellar account address');
    }
  }
}
