import { Injectable, NotFoundException } from '@nestjs/common';
import { IndexerService, IndexerUserData } from '../../../services/indexer.service';

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
}
