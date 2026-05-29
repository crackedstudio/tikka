import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, QueryRunner } from 'typeorm';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';

export interface IndexerCursor {
  lastLedger: number;
  lastPagingToken?: string;
  ledgerHashes: Array<{ ledger: number; hash: string }>;
}

const HASH_RING_SIZE = 200;

@Injectable()
export class CursorManagerService {
  private readonly logger = new Logger(CursorManagerService.name);

  constructor(
    @InjectRepository(IndexerCursorEntity)
    private readonly cursorRepo: Repository<IndexerCursorEntity>,
  ) {}

  async getCursor(): Promise<IndexerCursor | null> {
    this.logger.debug('Fetching cursor from storage...');
    const cursor = await this.cursorRepo.findOne({ where: { id: 1 } });

    if (cursor && cursor.lastLedger > 0) {
      return {
        lastLedger: cursor.lastLedger,
        lastPagingToken: cursor.lastPagingToken,
        ledgerHashes: cursor.ledgerHashes || [],
      };
    }
    return null;
  }

  /**
   * Updates the cursor and stores the ledger hash for reorg detection.
   * Maintains a ring buffer of the last HASH_RING_SIZE ledger hashes.
   */
  async saveCursor(
    ledger: number,
    ledgerHash: string,
    token?: string,
    queryRunner?: QueryRunner,
  ): Promise<void> {
    this.logger.debug(`Saving cursor: ledger=${ledger}, hash=${ledgerHash}, token=${token}`);

    const manager: EntityManager = queryRunner ? queryRunner.manager : this.cursorRepo.manager;

    const existing = await manager.findOne(IndexerCursorEntity, { where: { id: 1 } });
    const hashes = existing?.ledgerHashes || [];

    hashes.push({ ledger, hash: ledgerHash });
    if (hashes.length > HASH_RING_SIZE) {
      hashes.shift();
    }

    await manager.upsert(
      IndexerCursorEntity,
      {
        id: 1,
        lastLedger: ledger,
        lastPagingToken: token || '',
        ledgerHashes: hashes,
      },
      ['id'],
    );
  }

  /**
   * Checks if the given ledger hash matches the stored hash for that ledger.
   * Returns null if no reorg detected, or the divergence ledger if a reorg is found.
   */
  async checkForReorg(ledger: number, expectedHash: string): Promise<number | null> {
    const cursor = await this.getCursor();
    if (!cursor) return null;

    const stored = cursor.ledgerHashes.find((h) => h.ledger === ledger);
    if (!stored) return null;

    if (stored.hash !== expectedHash) {
      this.logger.warn(
        `Reorg detected at ledger ${ledger}: expected ${expectedHash}, got ${stored.hash}`,
      );
      return ledger;
    }

    return null;
  }
}
