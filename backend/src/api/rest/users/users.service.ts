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
}
