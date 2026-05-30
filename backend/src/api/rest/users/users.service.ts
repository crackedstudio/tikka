import { Injectable, NotFoundException } from '@nestjs/common';
import {
  IndexerService,
  IndexerUserData,
  IndexerUserHistoryResponse,
} from '../../../services/indexer.service';
import { UserHistoryQueryDto } from './dto/user-history-query.dto';

@Injectable()
export class UsersService {
  constructor(private readonly indexerService: IndexerService) {}

  /** Get user profile by Stellar address. */
  async getByAddress(address: string): Promise<IndexerUserData> {
    const user = await this.indexerService.getUser(address);
    if (!user) {
      throw new NotFoundException(`User ${address} not found`);
    }
    return user;
  }

  /** Get paginated raffle participation history for a user. */
  async getHistory(
    address: string,
    query: UserHistoryQueryDto,
  ): Promise<IndexerUserHistoryResponse> {
    // Ensure user exists before fetching history
    const user = await this.indexerService.getUser(address);
    if (!user) {
      throw new NotFoundException(`User ${address} not found`);
    }
    return this.indexerService.getUserHistory(address, query.limit, query.offset);
  }

  /**
   * Fetch the full (unpaginated) history for a user and serialise it as CSV.
   * Columns: raffle_id, role, tickets_bought, ticket_price, asset, status, outcome, timestamp
   */
  async getHistoryAsCsv(address: string): Promise<string> {
    const user = await this.indexerService.getUser(address);
    if (!user) {
      throw new NotFoundException(`User ${address} not found`);
    }

    // Fetch up to 10 000 records — sufficient for any realistic history
    const { items } = await this.indexerService.getUserHistory(address, 10000, 0);

    const header = 'raffle_id,role,tickets_bought,ticket_price,asset,status,outcome,timestamp';

    const rows = items.map((item) => {
      const outcome = item.is_winner ? 'won' : 'entered';
      const ticketPrice = '';   // not returned by indexer history endpoint
      const asset = '';         // not returned by indexer history endpoint
      const timestamp = '';     // not returned by indexer history endpoint (ledger only)

      // Escape any field that might contain commas or quotes
      const escape = (v: string | number) => {
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      return [
        escape(item.raffle_id),
        escape('participant'),
        escape(item.tickets_bought),
        escape(ticketPrice),
        escape(asset),
        escape(item.status),
        escape(outcome),
        escape(timestamp),
      ].join(',');
    });

    return [header, ...rows].join('\r\n');
  }
}
