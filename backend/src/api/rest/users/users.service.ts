import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeStellarAddress } from '@tikka/types';
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

  /**
   * Reduce a client-supplied address to the canonical strkey form used as the
   * `users` primary key.
   *
   * The indexer keys user rows by the canonical strkey (`UserProcessor` writes
   * `normalizeStellarAddress(...)`), and the indexer's own lookup is an exact
   * string match. Without this step a request for `" gabc… "` is forwarded as
   * `/users/%20gabc…%20` and comes back as a 404 for an account that exists.
   *
   * The message deliberately does not echo the rejected value: it is
   * unvalidated client input, and the response body is not the place to reflect
   * it back.
   */
  private canonicalAddress(address: string): string {
    const canonical = normalizeStellarAddress(address);
    if (!canonical) {
      throw new BadRequestException('address must be a Stellar account address');
    }
    return canonical;
  }

  /** Get user profile by Stellar address. */
  async getByAddress(address: string): Promise<IndexerUserData> {
    const canonical = this.canonicalAddress(address);
    const user = await this.indexerService.getUser(canonical);
    if (!user) {
      throw new NotFoundException(`User ${canonical} not found`);
    }
    return user;
  }

  /** Get paginated raffle participation history for a user. */
  async getHistory(
    address: string,
    query: UserHistoryQueryDto,
  ): Promise<IndexerUserHistoryResponse> {
    const canonical = this.canonicalAddress(address);
    // Ensure user exists before fetching history
    const user = await this.indexerService.getUser(canonical);
    if (!user) {
      throw new NotFoundException(`User ${canonical} not found`);
    }
    return this.indexerService.getUserHistory(canonical, query.limit, query.offset);
  }

  /**
   * Stream the full history for a user as a CSV file.
   * Columns: raffle_id, tickets_bought, purchased_at_ledger, is_winner, prize_amount
   */
  async getHistoryAsCsvStream(address: string): Promise<PassThrough> {
    const canonical = this.canonicalAddress(address);
    const user = await this.indexerService.getUser(canonical);
    if (!user) {
      throw new NotFoundException(`User ${canonical} not found`);
    }

    const stringifier = stringify({
      header: true,
      columns: ['raffle_id', 'tickets_bought', 'purchased_at_ledger', 'is_winner', 'prize_amount'],
    });

    // Need to return something fastify reply can stream from.
    // `pipe()` does not forward errors from the source, so without this listener a
    // failed page fetch would leave the response open — and the caller's
    // rate-limit slot occupied — until the client gave up. Forwarding the error
    // aborts the download instead.
    const passThrough = new PassThrough();
    stringifier.on('error', (err) => passThrough.destroy(err));
    stringifier.pipe(passThrough);

    // Stream generation in the background
    (async () => {
      try {
        let offset = 0;
        const limit = 100;

        while (true) {
          const { items } = await this.indexerService.getUserHistory(canonical, limit, offset);
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

    return passThrough;
  }
}
